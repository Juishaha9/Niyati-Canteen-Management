<?php
namespace App\Services;
use PDO;
final class PageDataService {
    public function __construct(private PDO $db) {}
    public function data(string $page,array $user,array $q=[]):array { return ['settings'=>$this->settings()] + match($page){
        'dashboard'=>$this->dashboard(), 'tables'=>$this->tables(), 'parcels'=>$this->parcels(), 'order'=>$this->order((int)($q['id']??0)), 'orders'=>$this->orders(), 'bills'=>$this->bills(), 'cancelled'=>$this->cancelled(), 'modified'=>$this->modified(), 'menu'=>$this->menu(), 'categories'=>['categories'=>$this->all('SELECT c.*,COUNT(m.id) item_count FROM menu_categories c LEFT JOIN menu_items m ON m.category_id=c.id AND m.active=1 GROUP BY c.id ORDER BY c.sort_order,c.name')], 'users'=>['users'=>$this->all('SELECT u.id,u.email,u.display_name,u.mobile,u.active,u.last_login_at,u.created_at,r.id role_id,r.code role FROM users u JOIN roles r ON r.id=u.role_id ORDER BY u.display_name'),'roles'=>$this->all('SELECT * FROM roles ORDER BY id')], 'reports'=>$this->reports($q), 'audits'=>$this->audits(), 'settings'=>$this->settingsPage(), default=>$this->tables()}; }
    private function tables():array{return ['tables'=>$this->all("SELECT t.*,o.id order_id,o.order_number,o.grand_total FROM canteen_tables t LEFT JOIN orders o ON o.table_id=t.id AND o.status IN ('DRAFT','OPEN','SERVED') WHERE t.active=1 AND t.kind='TABLE' ORDER BY t.sort_order,t.table_name")];}
    private function parcels():array{return ['tables'=>$this->all("SELECT t.*,o.id order_id,o.order_number,o.grand_total FROM canteen_tables t LEFT JOIN orders o ON o.table_id=t.id AND o.status IN ('DRAFT','OPEN','SERVED') WHERE t.active=1 AND t.kind='PARCEL' ORDER BY t.sort_order,t.table_name")];}
    private function menu():array{return ['categories'=>$this->all('SELECT * FROM menu_categories WHERE active=1 ORDER BY sort_order,name'),'menu'=>$this->all('SELECT m.*,c.name category_name FROM menu_items m JOIN menu_categories c ON c.id=m.category_id WHERE m.active=1 ORDER BY c.sort_order,m.sort_order,m.name'),'variants'=>$this->all('SELECT * FROM menu_item_variants WHERE active=1 ORDER BY sort_order,name')];}
    private function order(int $id):array{$order=$this->one('SELECT o.*,t.table_name,u.display_name created_by_name FROM orders o JOIN canteen_tables t ON t.id=o.table_id JOIN users u ON u.id=o.created_by WHERE o.id=?',[$id]);if(!$order)return ['missing'=>true];$menu=$this->menu();return $menu+['order'=>$order,'items'=>$this->all('SELECT oi.*,idx.discount_type item_discount_type,idx.discount_value item_discount_value FROM order_items oi LEFT JOIN item_discounts idx ON idx.order_item_id=oi.id AND idx.active=1 WHERE oi.order_id=? ORDER BY oi.id',[$id]),'audits'=>$this->all('SELECT a.*,u.display_name FROM order_audits a JOIN users u ON u.id=a.user_id WHERE a.order_id=? ORDER BY a.created_at DESC',[$id]),'settings'=>$this->settings()];}
    private function dashboard():array{
        $today=$this->summary("DATE(completed_at)=CURDATE()");
        $yesterday=$this->summary("DATE(completed_at)=DATE_SUB(CURDATE(), INTERVAL 1 DAY)");
        $ordersToday=(int)($this->one("SELECT COUNT(*) c FROM orders WHERE DATE(created_at)=CURDATE()")['c']??0);
        $ordersYesterday=(int)($this->one("SELECT COUNT(*) c FROM orders WHERE DATE(created_at)=DATE_SUB(CURDATE(), INTERVAL 1 DAY)")['c']??0);
        $pendingToday=(int)($this->one("SELECT COUNT(*) c FROM orders WHERE DATE(created_at)=CURDATE() AND status IN ('DRAFT','OPEN','SERVED')")['c']??0);
        $paidBills=(int)($today['paid_bills']??0);
        $cancelledToday=(int)($today['cancelled']??0);
        $netSales=(float)($today['net_sales']??0);
        $pct=fn($cur,$prev)=>$prev>0?(int)round((($cur-$prev)/$prev)*100):($cur>0?100:0);

        // "Parcel" is a display bucket for takeaway orders (order_type=TAKEAWAY), not part of the persisted status enum.
        $statusLabel=['DRAFT'=>'New','OPEN'=>'Preparing','SERVED'=>'Served','PAID'=>'Completed'];
        $buckets=['New'=>0,'Preparing'=>0,'Served'=>0,'Parcel'=>0,'Completed'=>0,'Cancelled'=>0];
        foreach($this->all("SELECT order_type,status,COUNT(*) c FROM orders WHERE DATE(created_at)=CURDATE() GROUP BY order_type,status") as $r){
            $c=(int)$r['c'];
            if($r['status']==='CANCELLED')$buckets['Cancelled']+=$c;
            elseif($r['order_type']==='TAKEAWAY')$buckets['Parcel']+=$c;
            else $buckets[$statusLabel[$r['status']]??'New']+=$c;
        }

        $available=0;$occupied=0;$disabled=0;$grid=[];
        foreach($this->all("SELECT table_name,status,active FROM canteen_tables WHERE kind='TABLE' ORDER BY sort_order,table_name") as $t){
            if(!(int)$t['active']){$disabled++;$st='Disabled';}
            elseif($t['status']==='AVAILABLE'){$available++;$st='Available';}
            else{$occupied++;$st='Occupied';}
            if(count($grid)<8)$grid[]=['code'=>$t['table_name'],'status'=>$st];
        }

        $recentOrders=array_map(function($o)use($statusLabel){
            $label=$o['status']==='CANCELLED'?'Cancelled':($o['order_type']==='TAKEAWAY'?'Parcel':($statusLabel[$o['status']]??$o['status']));
            return ['id'=>(int)$o['id'],'order'=>$o['order_number'],'time'=>date('g:i A',strtotime($o['updated_at'])),'table'=>$o['table_name']??'—','waiter'=>$o['display_name'],'amount'=>(float)$o['grand_total'],'status'=>$label];
        },$this->all("SELECT o.id,o.order_number,o.grand_total,o.status,o.order_type,o.updated_at,t.table_name,u.display_name FROM orders o LEFT JOIN canteen_tables t ON t.id=o.table_id JOIN users u ON u.id=o.created_by ORDER BY o.updated_at DESC LIMIT 6"));

        $cash=0.0;$upi=0.0;
        foreach($this->all("SELECT method,SUM(amount) amount FROM payments WHERE DATE(paid_at)=CURDATE() GROUP BY method") as $p){
            if($p['method']==='CASH')$cash=(float)$p['amount']; if($p['method']==='UPI')$upi=(float)$p['amount'];
        }

        $attention=[];
        $pendingBills=(int)($this->one("SELECT COUNT(*) c FROM orders WHERE status='SERVED'")['c']??0);
        $unavailableMenu=(int)($this->one("SELECT COUNT(*) c FROM menu_items WHERE active=0")['c']??0);
        $longPreparing=(int)($this->one("SELECT COUNT(*) c FROM orders WHERE status='OPEN' AND created_at<=DATE_SUB(NOW(), INTERVAL 20 MINUTE)")['c']??0);
        if($pendingBills>0)$attention[]=['id'=>'bills','text'=>"{$pendingBills} bill".($pendingBills===1?'':'s')." pending payment",'page'=>'bills'];
        if($disabled>0)$attention[]=['id'=>'tables','text'=>"{$disabled} table".($disabled===1?'':'s')." disabled",'page'=>'tables'];
        if($unavailableMenu>0)$attention[]=['id'=>'menu','text'=>"{$unavailableMenu} menu item".($unavailableMenu===1?'':'s')." unavailable",'page'=>'menu'];
        if($longPreparing>0)$attention[]=['id'=>'orders','text'=>"{$longPreparing} order".($longPreparing===1?'':'s')." preparing for more than 20 min",'page'=>'orders'];

        $trend=fn($period)=>array_map(fn($r)=>['label'=>$r['label'],'value'=>$r['sales']],$this->trendFor($period));

        return [
            'summary'=>['salesToday'=>$netSales,'salesChangePct'=>$pct($netSales,(float)($yesterday['net_sales']??0)),'ordersToday'=>$ordersToday,'ordersChangePct'=>$pct($ordersToday,$ordersYesterday),'totalBills'=>$paidBills+$cancelledToday,'pendingToday'=>$pendingToday],
            'salesTrend'=>['today'=>$trend('today'),'week'=>$trend('7days'),'month'=>$trend('month')],
            'ordersOverview'=>['total'=>$ordersToday,'completed'=>$buckets['Completed'],'preparing'=>$buckets['Preparing'],'served'=>$buckets['Served'],'parcel'=>$buckets['Parcel'],'cancelled'=>$buckets['Cancelled'],'new'=>$buckets['New']],
            'tables'=>['available'=>$available,'occupied'=>$occupied,'disabled'=>$disabled,'grid'=>$grid],
            'recentOrders'=>$recentOrders,
            'collection'=>['cash'=>$cash,'upi'=>$upi,'total'=>$netSales],
            'topItems'=>$this->all("SELECT item_name_snapshot name,SUM(quantity) qty,SUM(net_amount) sales FROM order_items oi JOIN orders o ON o.id=oi.order_id WHERE o.status='PAID' AND DATE(o.completed_at)=CURDATE() GROUP BY item_name_snapshot ORDER BY qty DESC,sales DESC LIMIT 5"),
            'discounts'=>['discountGiven'=>(float)($today['discounts']??0),'discountedBills'=>(int)($this->one("SELECT COUNT(*) c FROM orders WHERE status='PAID' AND DATE(completed_at)=CURDATE() AND discount_amount>0")['c']??0),'complimentaryValue'=>(float)($today['complementary']??0),'complimentaryOrders'=>(int)($this->one("SELECT COUNT(*) c FROM orders WHERE status='PAID' AND DATE(completed_at)=CURDATE() AND complementary_amount>0")['c']??0)],
            'attention'=>$attention,
        ];
    }
    private function trendFor(string $period):array{
        [$from,$to]=$this->periodRange($period,null,null);
        $days=(int)floor((strtotime($to)-strtotime($from))/86400)+1;
        $granularity=$days<=1?'hour':($days<=45?'day':'month');
        $groupExpr=$granularity==='hour'?'HOUR(completed_at)':($granularity==='day'?'DATE(completed_at)':"DATE_FORMAT(completed_at,'%Y-%m')");
        $rows=$this->all("SELECT $groupExpr bucket,COALESCE(SUM(grand_total),0) sales,COUNT(*) orders FROM orders WHERE status='PAID' AND DATE(completed_at) BETWEEN ? AND ? GROUP BY bucket",[$from,$to]);
        return $this->fillBuckets($granularity,$from,$to,$rows);
    }
    private function summary(string $where):array{return $this->one("SELECT COALESCE(SUM(grand_total),0) net_sales,COUNT(*) bills,COALESCE(SUM(discount_amount),0) discounts,COALESCE(SUM(complementary_amount),0) complementary,COALESCE(SUM(subtotal),0) gross,COALESCE(SUM(status='PAID'),0) paid_bills FROM orders WHERE status='PAID' AND {$where}") + ['cancelled'=>(int)($this->one("SELECT COUNT(*) count FROM orders WHERE status='CANCELLED' AND DATE(cancelled_at)=CURDATE()")['count']??0)];}
    private function orders():array{return ['orders'=>$this->all("SELECT o.*,t.table_name,u.display_name,COUNT(oi.id) item_count FROM orders o LEFT JOIN canteen_tables t ON t.id=o.table_id JOIN users u ON u.id=o.created_by LEFT JOIN order_items oi ON oi.order_id=o.id GROUP BY o.id ORDER BY o.updated_at DESC LIMIT 300"),'tables'=>$this->all('SELECT * FROM canteen_tables WHERE active=1 ORDER BY sort_order,table_name')];}
    private function bills():array{return ['orders'=>$this->all("SELECT o.*,t.table_name,u.display_name,p.method FROM orders o LEFT JOIN canteen_tables t ON t.id=o.table_id JOIN users u ON u.id=o.created_by LEFT JOIN payments p ON p.order_id=o.id WHERE o.status='PAID' ORDER BY o.completed_at DESC LIMIT 200")];}
    private function cancelled():array{return ['orders'=>$this->all("SELECT o.*,t.table_name,cu.display_name created_by_name,au.display_name cancelled_by_name FROM orders o LEFT JOIN canteen_tables t ON t.id=o.table_id LEFT JOIN users cu ON cu.id=o.created_by LEFT JOIN users au ON au.id=o.cancelled_by WHERE o.status='CANCELLED' ORDER BY o.cancelled_at DESC"),'users'=>$this->all('SELECT display_name FROM users ORDER BY display_name')];}
    private function modified():array{
        $orders=$this->all("SELECT o.*,t.table_name,COUNT(a.id) modifications,MAX(a.created_at) modified_at,
            COALESCE((SELECT JSON_UNQUOTE(JSON_EXTRACT(a2.old_values,'$.grand_total')) FROM order_audits a2 WHERE a2.order_id=o.id AND a2.action='ORDER_MODIFIED' ORDER BY a2.created_at ASC LIMIT 1),o.grand_total) original_total,
            (SELECT u2.display_name FROM order_audits a3 JOIN users u2 ON u2.id=a3.user_id WHERE a3.order_id=o.id AND a3.action='ORDER_MODIFIED' ORDER BY a3.created_at DESC LIMIT 1) modified_by_name
            FROM orders o LEFT JOIN canteen_tables t ON t.id=o.table_id JOIN order_audits a ON a.order_id=o.id AND a.action='ORDER_MODIFIED'
            GROUP BY o.id HAVING modifications>0 ORDER BY modified_at DESC");
        $changes=$this->all("SELECT a.*,u.display_name FROM order_audits a JOIN users u ON u.id=a.user_id
            WHERE a.action IN ('QUANTITY_CHANGED','ITEM_ADDED','ITEM_REMOVED','DISCOUNT_APPLIED','TABLE_CHANGED')
            AND a.order_id IN (SELECT DISTINCT order_id FROM order_audits WHERE action='ORDER_MODIFIED')
            ORDER BY a.order_id,a.created_at DESC");
        return ['orders'=>$orders,'changes'=>$changes];
    }
    private function reports(array $q):array{
        $period=$q['period']??'today';
        [$from,$to]=$this->periodRange($period,$q['from']??null,$q['to']??null);
        $days=(int)floor((strtotime($to)-strtotime($from))/86400)+1;
        $granularity=$days<=1?'hour':($days<=45?'day':'month');
        $groupExpr=$granularity==='hour'?'HOUR(completed_at)':($granularity==='day'?'DATE(completed_at)':"DATE_FORMAT(completed_at,'%Y-%m')");
        $trendRows=$this->all("SELECT $groupExpr bucket,COALESCE(SUM(grand_total),0) sales,COUNT(*) orders FROM orders WHERE status='PAID' AND DATE(completed_at) BETWEEN ? AND ? GROUP BY bucket",[$from,$to]);
        $paid=$this->one("SELECT COUNT(*) c,COALESCE(SUM(grand_total),0) sales,COALESCE(SUM(subtotal),0) gross,COALESCE(SUM(discount_amount),0) discounts,COALESCE(SUM(complementary_amount),0) complementary FROM orders WHERE status='PAID' AND DATE(completed_at) BETWEEN ? AND ?",[$from,$to]);
        $cancelled=$this->one("SELECT COUNT(*) c,COALESCE(SUM(grand_total),0) amount FROM orders WHERE status='CANCELLED' AND DATE(cancelled_at) BETWEEN ? AND ?",[$from,$to]);
        $paidCount=(int)($paid['c']??0);
        $statusRows=$this->all("SELECT status,COUNT(*) c FROM orders WHERE created_at BETWEEN ? AND ? GROUP BY status",[$from.' 00:00:00',$to.' 23:59:59']);
        $statusCounts=array_column($statusRows,'c','status');
        $statusBreakdown=array_map(fn($s)=>['status'=>$s,'count'=>(int)($statusCounts[$s]??0)],['DRAFT','OPEN','SERVED','PAID','CANCELLED']);
        $peakHours=$this->all("SELECT HOUR(completed_at) hour,COUNT(*) orders,SUM(grand_total) sales FROM orders WHERE status='PAID' AND DATE(completed_at) BETWEEN ? AND ? GROUP BY hour ORDER BY orders DESC,sales DESC LIMIT 8",[$from,$to]);
        foreach($peakHours as &$h){$h['label']=$this->hourLabel((int)$h['hour']);} unset($h);
        $modifiedRows=$this->all("SELECT o.id,o.bill_number,o.order_number,o.grand_total,
            COALESCE((SELECT JSON_UNQUOTE(JSON_EXTRACT(a2.old_values,'$.grand_total')) FROM order_audits a2 WHERE a2.order_id=o.id AND a2.action='ORDER_MODIFIED' ORDER BY a2.created_at ASC LIMIT 1),o.grand_total) original_total,
            (SELECT u2.display_name FROM order_audits a3 JOIN users u2 ON u2.id=a3.user_id WHERE a3.order_id=o.id AND a3.action='ORDER_MODIFIED' ORDER BY a3.created_at DESC LIMIT 1) modified_by_name,
            MAX(a.created_at) modified_at
            FROM orders o JOIN order_audits a ON a.order_id=o.id AND a.action='ORDER_MODIFIED'
            WHERE a.created_at BETWEEN ? AND ? GROUP BY o.id ORDER BY modified_at DESC",[$from.' 00:00:00',$to.' 23:59:59']);
        $modifiedAmountChanged=0.0; foreach($modifiedRows as $r){$modifiedAmountChanged+=abs((float)$r['grand_total']-(float)$r['original_total']);}
        return [
            'period'=>$period,'from'=>$from,'to'=>$to,'granularity'=>$granularity,
            'overview'=>['totalOrders'=>$paidCount+(int)($cancelled['c']??0),'totalSales'=>(float)($paid['sales']??0),'avgOrder'=>$paidCount>0?(float)$paid['sales']/$paidCount:0,'cancelledOrders'=>(int)($cancelled['c']??0),'cancelledAmount'=>(float)($cancelled['amount']??0),'paidBills'=>$paidCount,'grossSales'=>(float)($paid['gross']??0),'discounts'=>(float)($paid['discounts']??0),'complementary'=>(float)($paid['complementary']??0)],
            'trend'=>$this->fillBuckets($granularity,$from,$to,$trendRows),
            'statusBreakdown'=>$statusBreakdown,
            'payments'=>$this->all("SELECT p.method,COUNT(*) bills,SUM(p.amount) amount FROM payments p JOIN orders o ON o.id=p.order_id WHERE DATE(p.paid_at) BETWEEN ? AND ? GROUP BY p.method",[$from,$to]),
            'orderTypeBreakdown'=>$this->all("SELECT o.order_type,COUNT(*) orders,SUM(o.grand_total) sales FROM orders o WHERE o.status='PAID' AND DATE(o.completed_at) BETWEEN ? AND ? GROUP BY o.order_type",[$from,$to]),
            'topItems'=>$this->all("SELECT oi.item_name_snapshot name,COALESCE(mc.name,'Uncategorized') category,SUM(oi.quantity) qty,SUM(oi.net_amount) sales FROM order_items oi JOIN orders o ON o.id=oi.order_id LEFT JOIN menu_items mi ON mi.id=oi.menu_item_id LEFT JOIN menu_categories mc ON mc.id=mi.category_id WHERE o.status='PAID' AND DATE(o.completed_at) BETWEEN ? AND ? GROUP BY oi.item_name_snapshot,category ORDER BY qty DESC,sales DESC LIMIT 10",[$from,$to]),
            'categoryPerformance'=>$this->all("SELECT COALESCE(mc.name,'Uncategorized') category,SUM(oi.quantity) items_sold,COUNT(DISTINCT oi.order_id) orders,SUM(oi.net_amount) sales FROM order_items oi JOIN orders o ON o.id=oi.order_id LEFT JOIN menu_items mi ON mi.id=oi.menu_item_id LEFT JOIN menu_categories mc ON mc.id=mi.category_id WHERE o.status='PAID' AND DATE(o.completed_at) BETWEEN ? AND ? GROUP BY category ORDER BY sales DESC",[$from,$to]),
            'tablePerformance'=>$this->all("SELECT t.table_name,COUNT(*) orders,SUM(o.grand_total) sales FROM orders o JOIN canteen_tables t ON t.id=o.table_id WHERE o.status='PAID' AND t.kind='TABLE' AND DATE(o.completed_at) BETWEEN ? AND ? GROUP BY t.id ORDER BY sales DESC",[$from,$to]),
            'waiterPerformance'=>$this->all("SELECT u.display_name waiter,COUNT(*) orders,SUM(o.status='PAID') completed,SUM(o.status='CANCELLED') cancelled,COALESCE(SUM(IF(o.status='PAID',o.grand_total,0)),0) sales FROM orders o JOIN users u ON u.id=o.created_by WHERE o.created_at BETWEEN ? AND ? GROUP BY u.id ORDER BY sales DESC",[$from.' 00:00:00',$to.' 23:59:59']),
            'discountBreakdown'=>$this->all("SELECT discount_type,COUNT(DISTINCT order_id) bills,SUM(discount_amount) amount FROM ((SELECT d.order_id order_id,d.discount_type,d.discount_amount FROM discounts d JOIN orders o ON o.id=d.order_id WHERE d.active=1 AND o.status='PAID' AND DATE(o.completed_at) BETWEEN ? AND ?) UNION ALL (SELECT oi.order_id order_id,idx.discount_type,idx.discount_amount FROM item_discounts idx JOIN order_items oi ON oi.id=idx.order_item_id JOIN orders o ON o.id=oi.order_id WHERE idx.active=1 AND o.status='PAID' AND DATE(o.completed_at) BETWEEN ? AND ?)) x GROUP BY discount_type",[$from,$to,$from,$to]),
            'complimentaryBreakdown'=>$this->all("SELECT COALESCE(NULLIF(TRIM(ci.reason),''),'Other') reason,COUNT(DISTINCT oi.order_id) orders,SUM(ci.complementary_amount) amount FROM complementary_items ci JOIN order_items oi ON oi.id=ci.order_item_id JOIN orders o ON o.id=oi.order_id WHERE ci.active=1 AND o.status='PAID' AND DATE(o.completed_at) BETWEEN ? AND ? GROUP BY reason ORDER BY amount DESC",[$from,$to]),
            'cancelledBreakdown'=>$this->all("SELECT COALESCE(NULLIF(TRIM(cancellation_reason),''),'Other') reason,COUNT(*) bills,SUM(grand_total) amount FROM orders WHERE status='CANCELLED' AND DATE(cancelled_at) BETWEEN ? AND ? GROUP BY reason ORDER BY amount DESC",[$from,$to]),
            'modifiedSummary'=>['count'=>count($modifiedRows),'amountChanged'=>$modifiedAmountChanged,'rows'=>array_map(fn($r)=>['bill'=>$r['bill_number']?:$r['order_number'],'original'=>(float)$r['original_total'],'final'=>(float)$r['grand_total'],'modifiedBy'=>$r['modified_by_name']],array_slice($modifiedRows,0,5))],
            'peakHours'=>$peakHours,
        ];
    }
    private function periodRange(string $period,?string $from,?string $to):array{
        $today=new \DateTimeImmutable('today');
        return match($period){
            'today'=>[$today->format('Y-m-d'),$today->format('Y-m-d')],
            'yesterday'=>(function()use($today){$y=$today->modify('-1 day');return [$y->format('Y-m-d'),$y->format('Y-m-d')];})(),
            '7days'=>[$today->modify('-6 days')->format('Y-m-d'),$today->format('Y-m-d')],
            'month'=>[$today->format('Y-m-01'),$today->format('Y-m-d')],
            'lastmonth'=>(function()use($today){$end=$today->modify('first day of this month')->modify('-1 day');return [$end->format('Y-m-01'),$end->format('Y-m-d')];})(),
            'custom'=>[$from?:$today->format('Y-m-01'),$to?:$today->format('Y-m-d')],
            default=>[$today->format('Y-m-d'),$today->format('Y-m-d')],
        };
    }
    private function fillBuckets(string $granularity,string $from,string $to,array $rows):array{
        $byKey=[]; foreach($rows as $r)$byKey[(string)$r['bucket']]=$r;
        $out=[]; $cur=new \DateTimeImmutable($from); $end=new \DateTimeImmutable($to);
        if($granularity==='hour'){for($h=0;$h<24;$h++){$r=$byKey[(string)$h]??null;$out[]=['label'=>$this->hourLabel($h),'sales'=>(float)($r['sales']??0),'orders'=>(int)($r['orders']??0)];}}
        elseif($granularity==='day'){while($cur<=$end){$key=$cur->format('Y-m-d');$r=$byKey[$key]??null;$out[]=['label'=>$cur->format('d M'),'sales'=>(float)($r['sales']??0),'orders'=>(int)($r['orders']??0)];$cur=$cur->modify('+1 day');}}
        else{while($cur<=$end){$key=$cur->format('Y-m');$r=$byKey[$key]??null;$out[]=['label'=>$cur->format('M Y'),'sales'=>(float)($r['sales']??0),'orders'=>(int)($r['orders']??0)];$cur=$cur->modify('+1 month');}}
        return $out;
    }
    private function hourLabel(int $h):string{$s=$h%12===0?12:$h%12;$sAmPm=$h<12?'AM':'PM';$e=($h+1)%12===0?12:($h+1)%12;$eAmPm=($h+1)<12||($h+1)===24?'AM':'PM';return "{$s} {$sAmPm} - {$e} {$eAmPm}";}
    private function audits():array{return ['audits'=>$this->all("SELECT a.*,o.order_number,o.bill_number,u.display_name FROM order_audits a JOIN orders o ON o.id=a.order_id JOIN users u ON u.id=a.user_id ORDER BY a.created_at DESC LIMIT 300")];}
    private function settings():array{$rows=$this->all('SELECT setting_key,setting_value FROM settings');return array_column($rows,'setting_value','setting_key');}
    private function settingsPage():array{
        $users=$this->all("SELECT u.id,u.email,u.display_name,u.active,r.code role FROM users u JOIN roles r ON r.id=u.role_id ORDER BY u.display_name");
        $grants=$this->all('SELECT user_id,permission_code FROM user_permissions');
        $byUser=[]; foreach($grants as $g){$byUser[$g['user_id']][]=$g['permission_code'];}
        foreach($users as &$u){$u['permissions']=$byUser[$u['id']]??[];} unset($u);
        return ['settings'=>$this->settings(),'permissionCatalog'=>$this->all('SELECT code,name FROM permissions ORDER BY sort_order'),'permissionUsers'=>$users];
    }
    private function one(string $sql,array $v=[]):array{$s=$this->db->prepare($sql);$s->execute($v);return $s->fetch()?:[];}private function all(string $sql,array $v=[]):array{$s=$this->db->prepare($sql);$s->execute($v);return $s->fetchAll();}
}
