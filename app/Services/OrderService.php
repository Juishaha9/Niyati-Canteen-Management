<?php
namespace App\Services;
use PDO;
use App\Validators\Validator;

final class OrderService {
    private AuditService $audit;
    public function __construct(private PDO $db) { $this->audit = new AuditService($db); }
    public function create(int $tableId, array $user, string $numberFormat='ORD-{seq}'): int {
        $this->db->beginTransaction(); try {
            $table=$this->one('SELECT * FROM canteen_tables WHERE id=? AND active=1 FOR UPDATE',[$tableId]);
            if (!$table) throw new \InvalidArgumentException('That table is unavailable.');
            $open=$this->one("SELECT id FROM orders WHERE table_id=? AND status IN ('DRAFT','OPEN','SERVED') FOR UPDATE",[$tableId]);
            if ($open) { $this->db->commit(); return (int)$open['id']; }
            $orderType=$table['kind']==='PARCEL'?'TAKEAWAY':'TABLE';
            $s=$this->db->prepare("INSERT INTO orders(table_id,order_type,status,created_by,updated_by) VALUES(?,?,'DRAFT',?,?)"); $s->execute([$tableId,$orderType,$user['id'],$user['id']]); $id=(int)$this->db->lastInsertId();
            $number=str_replace('{seq}',(string)($id+1000),$numberFormat); $this->db->prepare('UPDATE orders SET order_number=? WHERE id=?')->execute([$number,$id]);
            $this->db->prepare("UPDATE canteen_tables SET status='OCCUPIED' WHERE id=?")->execute([$tableId]);
            $this->audit->order($id,$user['id'],'ORDER_CREATED',null,['table_id'=>$tableId,'order_number'=>$number]); $this->db->commit(); return $id;
        } catch (\Throwable $e) { if($this->db->inTransaction())$this->db->rollBack(); throw $e; }
    }
    public function update(int $orderId, int $tableId, string $status, string $orderType, array $user, bool $isAdmin=false): void {
        if (!in_array($status,['DRAFT','OPEN','SERVED'],true)) throw new \InvalidArgumentException('Invalid status.');
        if (!in_array($orderType,['TABLE','TAKEAWAY'],true)) throw new \InvalidArgumentException('Invalid order type.');
        $this->db->beginTransaction(); try {
            $order=$this->one('SELECT * FROM orders WHERE id=? FOR UPDATE',[$orderId]);
            if (!$order) throw new \InvalidArgumentException('Order not found.');
            $wasTerminal=in_array($order['status'],['PAID','CANCELLED'],true);
            if ($wasTerminal && !$isAdmin) throw new \RuntimeException('Only an administrator can reopen a completed or cancelled order.');
            $tableChanged=(int)$order['table_id']!==$tableId;
            if ($tableChanged || $wasTerminal) {
                $table=$this->one('SELECT * FROM canteen_tables WHERE id=? AND active=1 FOR UPDATE',[$tableId]);
                if (!$table) throw new \InvalidArgumentException('That table is unavailable.');
                $busy=$this->one("SELECT id FROM orders WHERE table_id=? AND status IN ('DRAFT','OPEN','SERVED') AND id<>? FOR UPDATE",[$tableId,$orderId]);
                if ($busy) throw new \InvalidArgumentException('That table already has an active order.');
                $old=$order['table_id'];
                $this->db->prepare("UPDATE canteen_tables SET status='OCCUPIED' WHERE id=?")->execute([$tableId]);
                if ($old && $tableChanged && !$wasTerminal) $this->db->prepare("UPDATE canteen_tables SET status='AVAILABLE' WHERE id=?")->execute([$old]);
                if ($tableChanged) $this->audit->order($orderId,$user['id'],'TABLE_CHANGED',['table_id'=>$old],['table_id'=>$tableId]);
            }
            if ($wasTerminal) {
                $this->db->prepare('DELETE FROM payments WHERE order_id=?')->execute([$orderId]);
                $this->db->prepare("UPDATE orders SET bill_number=NULL,completed_at=NULL,payment_status='UNPAID',cancelled_at=NULL,cancelled_by=NULL,cancellation_reason=NULL WHERE id=?")->execute([$orderId]);
                $this->audit->order($orderId,$user['id'],'ORDER_REOPENED',['status'=>$order['status']],['status'=>$status]);
            } elseif ($order['status']!==$status) {
                $this->audit->order($orderId,$user['id'],'STATUS_CHANGED',['status'=>$order['status']],['status'=>$status]);
            }
            if ($order['order_type']!==$orderType) $this->audit->order($orderId,$user['id'],'ORDER_TYPE_CHANGED',['order_type'=>$order['order_type']],['order_type'=>$orderType]);
            $this->db->prepare('UPDATE orders SET table_id=?,status=?,order_type=?,updated_by=? WHERE id=?')->execute([$tableId,$status,$orderType,$user['id'],$orderId]);
            $this->db->commit();
        } catch (\Throwable $e) { if($this->db->inTransaction())$this->db->rollBack(); throw $e; }
    }
    public function sync(int $orderId, array $payload, array $user): void {
        $this->db->beginTransaction(); try {
            $order=$this->one("SELECT * FROM orders WHERE id=? FOR UPDATE",[$orderId]); if(!$order || in_array($order['status'],['PAID','CANCELLED'],true)) throw new \InvalidArgumentException('This order can no longer be changed.');
            $discountEnabled=$this->setting('discount_enabled','1')==='1';
            $allowedTypes=$discountEnabled?array_filter(explode(',',$this->setting('discount_allowed_types','PERCENT,FIXED'))):[];
            $scope=$this->setting('discount_scope','BOTH');
            $maxPercent=(float)$this->setting('discount_max_percent','0'); $maxFixed=(float)$this->setting('discount_max_fixed','0');
            $compEnabled=$this->setting('complementary_enabled','1')==='1';
            $compRoles=array_filter(explode(',',$this->setting('complementary_roles','ADMIN,MANAGER')));
            $compAllowedForUser=$compEnabled && (($user['role']??'')==='ADMIN' || in_array($user['role']??'',$compRoles,true));
            $compReasonRequired=$this->setting('complementary_require_reason','1')==='1';
            $rows=is_array($payload['items']??null)?$payload['items']:[]; $normal=[];
            foreach($rows as $row){ $mid=Validator::positiveInt($row['menu_item_id']??null,'menu item'); $vid=isset($row['variant_id'])&&$row['variant_id']!==null?Validator::positiveInt($row['variant_id'],'variant'):null; $qty=Validator::positiveInt($row['quantity']??null,'quantity'); $comp=$compAllowedForUser && !empty($row['complementary']); $dType=in_array($row['discount_type']??'NONE',['PERCENT','FIXED'],true)?$row['discount_type']:'NONE'; $dValue=Validator::money(($row['discount_value']??0)===''?0:($row['discount_value']??0),'item discount'); $dReason=trim((string)($row['discount_reason']??''))?:null; if(isset($normal[$mid.'-'.$vid])){$normal[$mid.'-'.$vid]['quantity']+=$qty; $normal[$mid.'-'.$vid]['complementary']=$normal[$mid.'-'.$vid]['complementary']||$comp;}else $normal[$mid.'-'.$vid]=compact('mid','vid','qty','comp')+['quantity'=>$qty,'complementary'=>$comp,'discount_type'=>$dType,'discount_value'=>$dValue,'discount_reason'=>$dReason]; }
            $ids=array_values(array_unique(array_map(fn($x)=>$x['mid'],$normal))); $menu=[];
            if($ids){$marks=implode(',',array_fill(0,count($ids),'?')); foreach($this->all("SELECT * FROM menu_items WHERE id IN ($marks) AND active=1",$ids) as $m)$menu[$m['id']]=$m;}
            $variants=[]; if($normal){$vIds=array_values(array_filter(array_map(fn($x)=>$x['vid'],$normal)));if($vIds){$marks=implode(',',array_fill(0,count($vIds),'?'));foreach($this->all("SELECT * FROM menu_item_variants WHERE id IN ($marks) AND active=1",$vIds) as $v)$variants[$v['id']]=$v;}}
            $old=$this->all('SELECT * FROM order_items WHERE order_id=?',[$orderId]); $oldBy=[]; foreach($old as $o)$oldBy[$o['menu_item_id'].'-'.($o['menu_item_variant_id']??'')]=$o;
            $this->db->prepare('DELETE FROM item_discounts WHERE order_item_id IN (SELECT id FROM order_items WHERE order_id=?)')->execute([$orderId]);
            $this->db->prepare('DELETE FROM complementary_items WHERE order_item_id IN (SELECT id FROM order_items WHERE order_id=?)')->execute([$orderId]); $this->db->prepare('DELETE FROM order_items WHERE order_id=?')->execute([$orderId]);
            $itemDiscountAllowed=$discountEnabled && in_array($scope,['ITEM','BOTH'],true);
            $sub=0; $compTotal=0; $itemDiscountTotal=0; $created=[]; foreach($normal as $key=>$r){$item=$menu[$r['mid']]??null;if(!$item)throw new \InvalidArgumentException('A selected menu item is no longer available.');$variant=$r['vid']?($variants[$r['vid']]??null):null;if($r['vid']&&(!$variant||(int)$variant['menu_item_id']!==(int)$item['id']))throw new \InvalidArgumentException('Invalid menu variant.');$price=(float)($variant['price']??$item['price']);if($price<0||$item['price']===null&&!$variant)throw new \InvalidArgumentException('This item needs a price before it can be sold.');$gross=round($price*$r['quantity'],2);$comp=$r['complementary']?$gross:0;
                $itemDiscount=0;
                if(!$comp && $itemDiscountAllowed && $r['discount_type']!=='NONE' && $r['discount_value']>0 && in_array($r['discount_type'],$allowedTypes,true)){
                    $itemDiscount=$r['discount_type']==='PERCENT'?round($gross*min($r['discount_value'],$maxPercent)/100,2):min($r['discount_value'],$maxFixed);
                    $itemDiscount=min($gross,$itemDiscount);
                }
                $net=$gross-$comp-$itemDiscount;$s=$this->db->prepare('INSERT INTO order_items(order_id,menu_item_id,menu_item_variant_id,item_name_snapshot,variant_name_snapshot,quantity,unit_price,gross_amount,discount_amount,complementary_amount,net_amount)VALUES(?,?,?,?,?,?,?,?,?,?,?)');$s->execute([$orderId,$item['id'],$variant['id']??null,$item['name'],$variant['name']??null,$r['quantity'],$price,$gross,$itemDiscount,$comp,$net]);$oid=(int)$this->db->lastInsertId();
                if($comp){$this->db->prepare('INSERT INTO complementary_items(order_item_id,original_amount,complementary_amount,reason,applied_by)VALUES(?,?,?,?,?)')->execute([$oid,$gross,$comp,trim((string)($payload['complementary_reason']??''))?:null,$user['id']]);}
                if($itemDiscount>0){$this->db->prepare('INSERT INTO item_discounts(order_item_id,discount_type,discount_value,discount_amount,reason,applied_by)VALUES(?,?,?,?,?,?)')->execute([$oid,$r['discount_type'],$r['discount_value'],$itemDiscount,$r['discount_reason'],$user['id']]);}
                $sub+=$gross;$compTotal+=$comp;$itemDiscountTotal+=$itemDiscount;$created[]=['key'=>$key,'qty'=>$r['quantity'],'comp'=>$comp,'discount'=>$itemDiscount];}
            if($compTotal>0 && $compReasonRequired && trim((string)($payload['complementary_reason']??''))==='') throw new \InvalidArgumentException('A complementary reason is required.');
            $orderScopeAllowed=$discountEnabled && in_array($scope,['ORDER','BOTH'],true);
            $orderDiscount=$this->discount($orderId,$sub-$compTotal-$itemDiscountTotal,$payload,$user,$orderScopeAllowed,$allowedTypes,$maxPercent,$maxFixed);
            $totalDiscount=round($itemDiscountTotal+$orderDiscount,2);
            $status=$this->resolveApprovalStatus($totalDiscount,$sub-$compTotal,$user);
            $total=max(0,round($sub-$compTotal-$totalDiscount,2));
            if($status==='APPROVED' && $totalDiscount>0){$this->db->prepare("UPDATE orders SET status='OPEN',subtotal=?,discount_amount=?,complementary_amount=?,grand_total=?,discount_approval_status=?,discount_approved_by=?,discount_approved_at=NOW(),updated_by=? WHERE id=?")->execute([$sub,$totalDiscount,$compTotal,$total,$status,$user['id'],$user['id'],$orderId]);}
            else{$this->db->prepare("UPDATE orders SET status='OPEN',subtotal=?,discount_amount=?,complementary_amount=?,grand_total=?,discount_approval_status=?,discount_approved_by=NULL,discount_approved_at=NULL,updated_by=? WHERE id=?")->execute([$sub,$totalDiscount,$compTotal,$total,$status,$user['id'],$orderId]);}
            if($status==='PENDING')$this->audit->order($orderId,$user['id'],'DISCOUNT_PENDING_APPROVAL',null,['amount'=>$totalDiscount]);
            $this->auditChanges($orderId,$user['id'],$oldBy,$normal,$payload); $this->audit->order($orderId,$user['id'],'ORDER_MODIFIED',['grand_total'=>$order['grand_total']],['grand_total'=>$total]); $this->db->commit();
        } catch (\Throwable $e) {if($this->db->inTransaction())$this->db->rollBack();throw $e;}
    }
    private function resolveApprovalStatus(float $totalDiscount,float $base,array $user):string{
        if($totalDiscount<=0)return 'NONE';
        $thresholdPercentRaw=$this->setting('discount_approval_threshold_percent',''); $thresholdFixedRaw=$this->setting('discount_approval_threshold_fixed','');
        $percentEquivalent=$base>0?$totalDiscount/$base*100:0;
        $exceeds=false;
        if($thresholdPercentRaw!==''&&$percentEquivalent>(float)$thresholdPercentRaw)$exceeds=true;
        if($thresholdFixedRaw!==''&&$totalDiscount>(float)$thresholdFixedRaw)$exceeds=true;
        if(!$exceeds)return 'NONE';
        return in_array($user['role']??'',['ADMIN','MANAGER'],true)?'APPROVED':'PENDING';
    }
    private function discount(int $orderId,float $base,array $p,array $user,bool $allowed,array $allowedTypes,float $maxPercent,float $maxFixed): float { $type=$p['discount_type']??'NONE';$value=Validator::money($p['discount_value']??0,'discount');$reason=trim((string)($p['discount_reason']??''))?:null;$this->db->prepare('UPDATE discounts SET active=0 WHERE order_id=? AND active=1')->execute([$orderId]);if(!$allowed||$type==='NONE'||$value==0)return 0;if(!in_array($type,['PERCENT','FIXED'],true))throw new \InvalidArgumentException('Invalid discount type.');if(!in_array($type,$allowedTypes,true))throw new \InvalidArgumentException('That discount type is not enabled in Settings.');$value=$type==='PERCENT'?min($value,$maxPercent):min($value,$maxFixed);$amount=$type==='PERCENT'?round($base*$value/100,2):$value;$amount=min(max(0,$base),$amount);$this->db->prepare('INSERT INTO discounts(order_id,discount_type,discount_value,discount_amount,reason,applied_by) VALUES(?,?,?,?,?,?)')->execute([$orderId,$type,$value,$amount,$reason,$user['id']]);return $amount; }
    public function pay(int $id,string $method,array $user,string $billNumberFormat='BILL-{seq}',bool $autoFreeTable=true): void {$this->db->beginTransaction();try{$o=$this->one('SELECT * FROM orders WHERE id=? FOR UPDATE',[$id]);if(!$o||!in_array($o['status'],['OPEN','SERVED'],true))throw new \InvalidArgumentException('Only an open order with saved items can be paid.');if($o['discount_approval_status']==='PENDING')throw new \InvalidArgumentException('This order has a discount pending admin/manager approval.');if(!in_array($method,['CASH','UPI','OTHER'],true))throw new \InvalidArgumentException('Invalid payment method.');$bill=str_replace('{seq}',(string)($id+1000),$billNumberFormat);$this->db->prepare("UPDATE orders SET status='PAID',payment_status='PAID',bill_number=?,completed_at=NOW(),updated_by=? WHERE id=?")->execute([$bill,$user['id'],$id]);$this->db->prepare('INSERT INTO payments(order_id,method,amount,received_by)VALUES(?,?,?,?)')->execute([$id,$method,$o['grand_total'],$user['id']]);if($autoFreeTable)$this->db->prepare("UPDATE canteen_tables SET status='AVAILABLE' WHERE id=?")->execute([$o['table_id']]);$this->audit->bill($id,$user['id'],'BILL_PAID',null,['bill_number'=>$bill,'method'=>$method,'amount'=>$o['grand_total']]);$this->db->commit();}catch(\Throwable $e){if($this->db->inTransaction())$this->db->rollBack();throw $e;}}
    public function approveDiscount(int $id,array $user):void{$this->db->beginTransaction();try{$o=$this->one('SELECT * FROM orders WHERE id=? FOR UPDATE',[$id]);if(!$o)throw new \InvalidArgumentException('Order not found.');if($o['discount_approval_status']!=='PENDING')throw new \InvalidArgumentException('This order has no discount pending approval.');$this->db->prepare("UPDATE orders SET discount_approval_status='APPROVED',discount_approved_by=?,discount_approved_at=NOW() WHERE id=?")->execute([$user['id'],$id]);$this->audit->order($id,$user['id'],'DISCOUNT_APPROVED',null,['discount_amount'=>$o['discount_amount']]);$this->db->commit();}catch(\Throwable $e){if($this->db->inTransaction())$this->db->rollBack();throw $e;}}
    public function rejectDiscount(int $id,string $reason,array $user):void{$this->db->beginTransaction();try{$o=$this->one('SELECT * FROM orders WHERE id=? FOR UPDATE',[$id]);if(!$o)throw new \InvalidArgumentException('Order not found.');if($o['discount_approval_status']!=='PENDING')throw new \InvalidArgumentException('This order has no discount pending approval.');$this->db->prepare('UPDATE discounts SET active=0 WHERE order_id=? AND active=1')->execute([$id]);$this->db->prepare('UPDATE item_discounts SET active=0 WHERE order_item_id IN (SELECT id FROM order_items WHERE order_id=?)')->execute([$id]);$this->db->prepare('UPDATE order_items SET net_amount=net_amount+discount_amount,discount_amount=0 WHERE order_id=?')->execute([$id]);$grand=(float)$o['subtotal']-(float)$o['complementary_amount'];$this->db->prepare("UPDATE orders SET discount_amount=0,grand_total=?,discount_approval_status='REJECTED',discount_approved_by=?,discount_approved_at=NOW() WHERE id=?")->execute([max(0,$grand),$user['id'],$id]);$this->audit->order($id,$user['id'],'DISCOUNT_REJECTED',['discount_amount'=>$o['discount_amount']],null,$reason);$this->db->commit();}catch(\Throwable $e){if($this->db->inTransaction())$this->db->rollBack();throw $e;}}
    private array $settingsCache=[];
    private function setting(string $key,string $default=''):string{if(!array_key_exists($key,$this->settingsCache)){$s=$this->db->prepare('SELECT setting_value FROM settings WHERE setting_key=?');$s->execute([$key]);$v=$s->fetchColumn();$this->settingsCache[$key]=$v!==false?$v:$default;}return $this->settingsCache[$key];}
    public function cancel(int $id,string $reason,array $user,bool $autoFreeTable=true): void {$this->db->beginTransaction();try{$o=$this->one('SELECT * FROM orders WHERE id=? FOR UPDATE',[$id]);if(!$o||$o['status']==='CANCELLED')throw new \InvalidArgumentException('Order cannot be cancelled.');$this->db->prepare("UPDATE orders SET status='CANCELLED',cancelled_at=NOW(),cancelled_by=?,cancellation_reason=?,updated_by=? WHERE id=?")->execute([$user['id'],$reason,$user['id'],$id]);if($o['table_id']&&$autoFreeTable)$this->db->prepare("UPDATE canteen_tables SET status='AVAILABLE' WHERE id=?")->execute([$o['table_id']]);$this->audit->bill($id,$user['id'],'BILL_CANCELLED',['status'=>$o['status']],['status'=>'CANCELLED'],$reason);$this->db->commit();}catch(\Throwable $e){if($this->db->inTransaction())$this->db->rollBack();throw $e;}}
    private function auditChanges(int $id,int $uid,array $old,array $new,array $p):void{foreach($new as $key=>$v){$was=$old[$key]??null;if(!$was)$this->audit->order($id,$uid,'ITEM_ADDED',null,$v);elseif((int)$was['quantity']!==$v['quantity'])$this->audit->order($id,$uid,'QUANTITY_CHANGED',['quantity'=>$was['quantity']],['quantity'=>$v['quantity']]);unset($old[$key]);}foreach($old as $v)$this->audit->order($id,$uid,'ITEM_REMOVED',$v,null);if(($p['discount_type']??'NONE')!=='NONE')$this->audit->order($id,$uid,'DISCOUNT_APPLIED',null,['type'=>$p['discount_type'],'value'=>$p['discount_value']??0]);}
    private function one(string $sql,array $a=[]):?array{$s=$this->db->prepare($sql);$s->execute($a);return $s->fetch()?:null;} private function all(string $sql,array $a=[]):array{$s=$this->db->prepare($sql);$s->execute($a);return $s->fetchAll();}
}
