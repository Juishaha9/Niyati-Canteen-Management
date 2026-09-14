<?php
use App\Auth\Auth; use App\Helpers\Csrf; use App\Helpers\View; use App\Services\OrderService; use App\Services\PrintJobService; use App\Validators\Validator;
return function(PDO $db): void {
    $setting=function(string $key,string $default='')use($db):string{static $cache=[];if(!array_key_exists($key,$cache)){$s=$db->prepare('SELECT setting_value FROM settings WHERE setting_key=?');$s->execute([$key]);$v=$s->fetchColumn();$cache[$key]=$v!==false?$v:$default;}return $cache[$key];};
    $guardAdminTarget=function(int $targetId)use($db):void{$rc=$db->prepare('SELECT r.code FROM users u JOIN roles r ON r.id=u.role_id WHERE u.id=?');$rc->execute([$targetId]);if($rc->fetchColumn()==='ADMIN')throw new RuntimeException('Only an administrator can manage another administrator account.');};
    // ===== Niyati Print Bridge API (machine-to-machine, no PHP session) =====
    // A background Windows process has no cookie jar, so it can never pass
    // Auth::check()/CSRF — it authenticates with a Bearer token instead
    // (see PrintJobService::authenticateBridge). This branch must run
    // BEFORE the human action dispatch below (which unconditionally calls
    // Csrf::verify()) and before the Auth::check() page gate further down,
    // or a bridge request would always be rejected as an unauthenticated
    // page view. $_GET['page'] is already set by public/index.php from the
    // request path before this file runs, so it's safe to read this early.
    if((($_GET['page']??'')==='print-bridge')){
        header('Content-Type: application/json'); header('Cache-Control: no-store');
        $printJobs=new PrintJobService($db);
        $authHeader=$_SERVER['HTTP_AUTHORIZATION']??($_SERVER['REDIRECT_HTTP_AUTHORIZATION']??'');
        $token=null; if(preg_match('/^Bearer\s+(.+)$/i',trim($authHeader),$m))$token=trim($m[1]);
        $bridge=$printJobs->authenticateBridge($token);
        if(!$bridge){http_response_code(401);echo json_encode(['ok'=>false,'error'=>'Invalid or missing bridge token.']);return;}
        $bAction=$_POST['action']??($_GET['action']??'');
        try{
            if($bAction==='poll'){
                $printJobs->touchBridge((int)$bridge['id'],(array)($_POST['printers']??[]));
                echo json_encode(['ok'=>true,'jobs'=>$printJobs->queuedFor((int)$bridge['counter_id'])]); return;
            }
            if($bAction==='claim'){
                $jobId=Validator::positiveInt($_POST['job_id']??null,'job');
                $job=$printJobs->claim($jobId,(int)$bridge['counter_id'],(int)$bridge['id']);
                if(!$job){echo json_encode(['ok'=>false,'error'=>'Job already claimed or no longer queued.']);return;}
                echo json_encode(['ok'=>true,'job'=>$job]); return;
            }
            if($bAction==='complete'){
                $jobId=Validator::positiveInt($_POST['job_id']??null,'job');
                echo json_encode(['ok'=>$printJobs->complete($jobId,(int)$bridge['counter_id'])]); return;
            }
            if($bAction==='fail'){
                $jobId=Validator::positiveInt($_POST['job_id']??null,'job');
                $err=Validator::text($_POST['error']??'Print failed.','error message',500,false);
                echo json_encode(['ok'=>$printJobs->fail($jobId,(int)$bridge['counter_id'],$err?:'Print failed.')]); return;
            }
            echo json_encode(['ok'=>false,'error'=>'Unknown bridge action.']);
        }catch(Throwable $e){echo json_encode(['ok'=>false,'error'=>$e->getMessage()]);}
        return;
    }
    // canteen_images/ sits directly under the app's public/static root — but
    // where that root actually is depends on the deployment layout: locally
    // (and on any host pointed at public/ as the docroot) routes/web.php's
    // own parent directory is the *project* root, one level above public/;
    // on Hostinger-style flat hosting, everything (including canteen_images
    // itself) is deployed straight into that same parent directory, with no
    // public/ subfolder at all. Hardcoding ".../public/canteen_images" (as
    // this used to) only ever matched the first case, which is exactly why
    // the picker came back empty in production: scandir() on a directory
    // that doesn't exist there just returns nothing, not an error. Checking
    // which shape is actually on disk — the same adaptive approach
    // public/index.php already uses for $root — makes this work unmodified
    // in both.
    $projectRoot=dirname(__DIR__);
    $canteenImagesDir=is_dir($projectRoot.'/public/canteen_images')?$projectRoot.'/public/canteen_images':$projectRoot.'/canteen_images';
    $action=$_POST['action']??''; $user=Auth::user(); if($action){Csrf::verify($_POST['_csrf']??null); try { if($action==='login'){if(!Auth::attempt($db,Validator::text($_POST['email']??'','email, mobile number or full name',150),$_POST['password']??''))throw new InvalidArgumentException('Incorrect email, mobile number, full name or password.');View::redirect('/'.(Auth::can('ADMIN')?'dashboard':'tables'));}
        if(!Auth::check())throw new RuntimeException('Please sign in.');$order=new OrderService($db);
        // Any authenticated user who can process a payment can also queue
        // its receipt for printing — same permission scope as order_pay
        // itself. Returns JSON (not a redirect) since this is always called
        // from a background fetch, never a real form submit, so it's
        // handled with its own try/catch to bypass the surrounding
        // redirect-oriented error handling entirely.
        if($action==='print_job_create'){
            header('Content-Type: application/json');
            try{
                $result=(new PrintJobService($db))->create(Validator::positiveInt($_POST['order_id']??null,'order'),Validator::positiveInt($_POST['counter_id']??null,'counter'),(string)($_POST['paper_width']??'80'),(string)($_POST['escpos_base64']??''),(int)$user['id']);
                echo json_encode(['ok'=>true]+$result);
            }catch(Throwable $e){http_response_code(400);echo json_encode(['ok'=>false,'error'=>$e->getMessage()]);}
            return;
        }
        if($action==='print_test_job_create'){
            header('Content-Type: application/json');
            try{
                $result=(new PrintJobService($db))->createTest(Validator::positiveInt($_POST['counter_id']??null,'counter'),(string)($_POST['paper_width']??'80'),(string)($_POST['escpos_base64']??''),(int)$user['id']);
                echo json_encode(['ok'=>true]+$result);
            }catch(Throwable $e){http_response_code(400);echo json_encode(['ok'=>false,'error'=>$e->getMessage()]);}
            return;
        }
        if($action==='print_bridge_token_create'){
            if(!Auth::allowed($db,'settings'))throw new RuntimeException('You do not have permission to manage the printer bridge.');
            $result=(new PrintJobService($db))->generateBridgeToken(Validator::positiveInt($_POST['counter_id']??null,'counter'),(int)$user['id']);
            // Shown to the admin exactly once — same one-shot-flash pattern
            // payment_success already uses below, reused here rather than
            // inventing a second response shape for "show this once" data.
            View::flash('bridge_token_created',json_encode($result));View::redirect('/settings?tab=printer');
        }
        if($action==='print_bridge_revoke'){
            if(!Auth::allowed($db,'settings'))throw new RuntimeException('You do not have permission to manage the printer bridge.');
            (new PrintJobService($db))->revokeBridge(Validator::positiveInt($_POST['bridge_id']??null,'bridge'));
            View::flash('success','Print bridge disconnected.');View::redirect('/settings?tab=printer');
        }
        if($action==='counter_save'){
            if(!Auth::can('ADMIN'))throw new RuntimeException('Administrator permission required.');
            $id=(int)($_POST['id']??0);$name=Validator::text($_POST['name']??'','counter name',100);$active=!empty($_POST['active'])?1:0;
            if($id)$db->prepare('UPDATE counters SET name=?,active=? WHERE id=?')->execute([$name,$active,$id]);
            else $db->prepare('INSERT INTO counters(name,active,sort_order) VALUES(?,?,(SELECT n FROM (SELECT COALESCE(MAX(sort_order),0)+1 n FROM counters) t))')->execute([$name,$active]);
            View::flash('success','Counter saved.');View::redirect('/settings?tab=printer');
        }
        if($action==='logout'){Auth::logout();View::redirect('/');}if($action==='order_create'){View::redirect('/order?id='.$order->create(Validator::positiveInt($_POST['table_id']??null,'table'),$user,$setting('order_number_format','ORD-{seq}')));}if($action==='order_edit'){$order->update(Validator::positiveInt($_POST['order_id']??null,'order'),Validator::positiveInt($_POST['table_id']??null,'table'),(string)($_POST['status']??'DRAFT'),(string)($_POST['order_type']??'TABLE'),$user,Auth::can('ADMIN'));View::flash('success','Order updated.');View::redirect('/orders');}if($action==='order_sync'){$payload=json_decode($_POST['payload']??'',true,512,JSON_THROW_ON_ERROR);$order->sync(Validator::positiveInt($_POST['order_id']??null,'order'),$payload,$user);View::flash('success','Order saved.');View::redirect('/order?id='.(int)$_POST['order_id']);}if($action==='order_pay'){$result=$order->pay(Validator::positiveInt($_POST['order_id']??null,'order'),$_POST['method']??'',$user,$setting('bill_number_format','BILL-{seq}'),$setting('auto_free_table_after_completion','1')==='1');View::flash('payment_success',json_encode($result));View::redirect('/'.($result['order_type']==='TAKEAWAY'?'parcels':'tables'));}if($action==='order_cancel'){if(!Auth::allowed($db,'cancel_orders'))throw new RuntimeException('You do not have permission to cancel orders/bills.');if($setting('allow_order_cancellation','1')!=='1')throw new RuntimeException('Order cancellation is currently disabled in Settings.');$reasonRequired=$setting('require_cancellation_reason','1')==='1';$reason=$reasonRequired?Validator::text($_POST['reason']??'','cancellation reason'):trim((string)($_POST['reason']??''));$order->cancel(Validator::positiveInt($_POST['order_id']??null,'order'),$reason,$user,$setting('auto_free_table_after_completion','1')==='1');View::flash('success','Bill cancelled and preserved in history.');View::redirect('/cancelled');}
        if($action==='discount_approve'){if(!Auth::can('ADMIN','MANAGER'))throw new RuntimeException('Only an administrator or manager can approve discounts.');$id=Validator::positiveInt($_POST['order_id']??null,'order');$order->approveDiscount($id,$user);View::flash('success','Discount approved.');View::redirect('/order?id='.$id);}
        if($action==='discount_reject'){if(!Auth::can('ADMIN','MANAGER'))throw new RuntimeException('Only an administrator or manager can reject discounts.');$id=Validator::positiveInt($_POST['order_id']??null,'order');$reason=Validator::text($_POST['reason']??'','rejection reason');$order->rejectDiscount($id,$reason,$user);View::flash('success','Discount rejected.');View::redirect('/order?id='.$id);}
        if($action==='table_save'){if(!Auth::can('ADMIN'))throw new RuntimeException('Administrator permission required.');$id=(int)($_POST['id']??0);$kind=($_POST['kind']??'TABLE')==='PARCEL'?'PARCEL':'TABLE';$name=Validator::text($_POST['table_name']??'','table name',64);$active=!empty($_POST['active'])?1:0;$sort=(int)($_POST['sort_order']??0);if($id)$db->prepare('UPDATE canteen_tables SET table_name=?,active=?,sort_order=? WHERE id=?')->execute([$name,$active,$sort,$id]);else{$status=in_array($setting('default_table_status','AVAILABLE'),['AVAILABLE','OCCUPIED','BILLING','RESERVED'],true)?$setting('default_table_status','AVAILABLE'):'AVAILABLE';$db->prepare('INSERT INTO canteen_tables(table_name,kind,status,active,sort_order)VALUES(?,?,?,?,?)')->execute([$name,$kind,$status,$active,$sort]);}View::redirect('/'.($kind==='PARCEL'?'parcels':'tables'));}
        if($action==='table_delete'){if(!Auth::can('ADMIN'))throw new RuntimeException('Administrator permission required.');$id=Validator::positiveInt($_POST['id']??null,'table');$row=$db->prepare('SELECT kind FROM canteen_tables WHERE id=?');$row->execute([$id]);$kind=$row->fetchColumn();if(!$kind)throw new InvalidArgumentException('Table not found.');$busy=$db->prepare("SELECT 1 FROM orders WHERE table_id=? AND status IN ('DRAFT','OPEN','SERVED')");$busy->execute([$id]);if($busy->fetchColumn())throw new RuntimeException('Cannot delete a '.($kind==='PARCEL'?'parcel':'table').' with an active order.');$db->prepare('UPDATE canteen_tables SET active=0 WHERE id=?')->execute([$id]);View::flash('success',($kind==='PARCEL'?'Parcel':'Table').' deleted.');View::redirect('/'.($kind==='PARCEL'?'parcels':'tables'));}
        if($action==='category_save'){if(!Auth::allowed($db,'categories'))throw new RuntimeException('You do not have permission to manage categories.');$id=(int)($_POST['id']??0);$v=[Validator::text($_POST['name']??'','category',100),!empty($_POST['active'])?1:0,(int)($_POST['sort_order']??0)];if($id){$v[]=$id;$db->prepare('UPDATE menu_categories SET name=?,active=?,sort_order=? WHERE id=?')->execute($v);}else $db->prepare('INSERT INTO menu_categories(name,active,sort_order)VALUES(?,?,?)')->execute($v);View::flash('success','Category saved.');View::redirect('/categories');}
        if($action==='category_delete'){if(!Auth::allowed($db,'categories'))throw new RuntimeException('You do not have permission to manage categories.');$id=Validator::positiveInt($_POST['id']??null,'category');$db->prepare('UPDATE menu_categories SET active=0 WHERE id=?')->execute([$id]);View::flash('success','Category deleted.');View::redirect('/categories');}
        if($action==='menu_save'){if(!Auth::allowed($db,'menu'))throw new RuntimeException('You do not have permission to manage the menu.');$id=(int)($_POST['id']??0);$cat=Validator::positiveInt($_POST['category_id']??null,'category');$name=Validator::text($_POST['name']??'','item name',150);$price=Validator::money($_POST['price']??null,'price',true);$desc=trim((string)($_POST['description']??''));$active=1;$sort=(int)($_POST['sort_order']??0);if($id){$old=$db->prepare('SELECT price FROM menu_items WHERE id=?');$old->execute([$id]);$old=$old->fetch();$db->prepare('UPDATE menu_items SET category_id=?,name=?,description=?,price=?,active=?,sort_order=? WHERE id=?')->execute([$cat,$name,$desc?:null,$price,$active,$sort,$id]);if($old&&$old['price']!=$price)$db->prepare('INSERT INTO menu_item_price_history(menu_item_id,old_price,new_price,changed_by)VALUES(?,?,?,?)')->execute([$id,$old['price'],$price,$user['id']]);}else{$db->prepare('INSERT INTO menu_items(category_id,name,description,price,active,sort_order)VALUES(?,?,?,?,?,?)')->execute([$cat,$name,$desc?:null,$price,$active,$sort]);}$id=$id?:$db->lastInsertId();
        // Images are picked from the fixed public/canteen_images library —
        // never uploaded. The client only ever sends back a filename it
        // received from the /menu?images=1 listing above, but that's still
        // an untrusted client-supplied string, so it's re-validated here
        // exactly like a fresh request: safe-filename shape, then resolved
        // with realpath() and checked to actually land inside that
        // directory (blocks any ../ traversal) and exist as a real file,
        // before it's ever written to the database.
        $imagePath=trim((string)($_POST['image_path']??''));
        if($imagePath!==''){
            if(!preg_match('/^[A-Za-z0-9 _\-\.]+\.webp$/',$imagePath))throw new InvalidArgumentException('Invalid image selection.');
            $imagesDir=realpath($canteenImagesDir);
            $chosen=$imagesDir?realpath($imagesDir.'/'.$imagePath):false;
            if(!$imagesDir||!$chosen||strncmp($chosen,$imagesDir,strlen($imagesDir))!==0||!is_file($chosen))throw new InvalidArgumentException('Invalid image selection.');
        }
        $db->prepare('UPDATE menu_items SET image_path=? WHERE id=?')->execute([$imagePath!==''?$imagePath:null,$id]);
        View::redirect('/menu');}
        if($action==='menu_delete'){if(!Auth::allowed($db,'menu'))throw new RuntimeException('You do not have permission to manage the menu.');$id=Validator::positiveInt($_POST['id']??null,'menu item');$db->prepare('UPDATE menu_items SET active=0 WHERE id=?')->execute([$id]);View::flash('success','Menu item deleted.');View::redirect('/menu');}
        if($action==='user_save'){if(!Auth::allowed($db,'users'))throw new RuntimeException('You do not have permission to manage users.');$id=(int)($_POST['id']??0);$role=Validator::positiveInt($_POST['role_id']??null,'role');$rc=$db->prepare('SELECT code FROM roles WHERE id=?');$rc->execute([$role]);$roleCode=$rc->fetchColumn();if(!$roleCode)throw new InvalidArgumentException('Invalid role.');if(!Auth::can('ADMIN')){if($roleCode==='ADMIN')throw new RuntimeException('Only an administrator can assign the Administrator role.');if($id)$guardAdminTarget($id);}$email=Validator::text($_POST['email']??'','email address',150);if(!filter_var($email,FILTER_VALIDATE_EMAIL))throw new InvalidArgumentException('Enter a valid email address.');$name=Validator::text($_POST['display_name']??'','full name',100);$mobile=Validator::mobile($_POST['mobile']??'','mobile number');$active=!empty($_POST['active'])?1:0;$pass=(string)($_POST['password']??'');$confirm=(string)($_POST['confirm_password']??'');if($pass!==''&&$pass!==$confirm)throw new InvalidArgumentException('Password and confirm password do not match.');$dupName=$db->prepare('SELECT id FROM users WHERE active=1 AND display_name=? AND id<>?');$dupName->execute([$name,$id]);if($dupName->fetchColumn())throw new InvalidArgumentException('That full name is already in use by another active user — full names must be unique since they can be used to sign in.');if($mobile!==null){$dupMobile=$db->prepare('SELECT id FROM users WHERE active=1 AND mobile=? AND id<>?');$dupMobile->execute([$mobile,$id]);if($dupMobile->fetchColumn())throw new InvalidArgumentException('That mobile number is already in use by another active user.');}if($id){$db->prepare('UPDATE users SET role_id=?,email=?,display_name=?,mobile=?,active=? WHERE id=?')->execute([$role,$email,$name,$mobile,$active,$id]);if($pass!=='')$db->prepare('UPDATE users SET password_hash=? WHERE id=?')->execute([password_hash($pass,PASSWORD_DEFAULT),$id]);}else{if($pass==='')throw new InvalidArgumentException('Password is required.');$db->prepare('INSERT INTO users(role_id,email,display_name,mobile,password_hash,active)VALUES(?,?,?,?,?,?)')->execute([$role,$email,$name,$mobile,password_hash($pass,PASSWORD_DEFAULT),$active]);
        // A new non-ADMIN user starts with zero permissions (least privilege) —
        // previously every permission row was auto-granted here, which meant a
        // freshly created WAITER/MANAGER silently had ADMIN-equivalent access
        // (incl. managing other users and business settings) until someone
        // remembered to visit Settings > Access and uncheck boxes. An
        // administrator now grants access explicitly via that same screen
        // (action=user_permissions_save) after creating the account.
        }View::flash('success',$id?'User updated.':'User created.');View::redirect('/users');}
        if($action==='user_reset_password'){if(!Auth::allowed($db,'users'))throw new RuntimeException('You do not have permission to manage users.');$id=Validator::positiveInt($_POST['id']??null,'user');if(!Auth::can('ADMIN'))$guardAdminTarget($id);$pass=Validator::text($_POST['password']??'','password',255);$confirm=(string)($_POST['confirm_password']??'');if($pass!==$confirm)throw new InvalidArgumentException('Password and confirm password do not match.');$db->prepare('UPDATE users SET password_hash=? WHERE id=?')->execute([password_hash($pass,PASSWORD_DEFAULT),$id]);View::flash('success','Password reset.');View::redirect('/users');}
        if($action==='user_toggle_active'){if(!Auth::allowed($db,'users'))throw new RuntimeException('You do not have permission to manage users.');$id=Validator::positiveInt($_POST['id']??null,'user');if($id===(int)$user['id'])throw new RuntimeException('You cannot disable your own account.');if(!Auth::can('ADMIN'))$guardAdminTarget($id);$db->prepare('UPDATE users SET active=IF(active=1,0,1) WHERE id=?')->execute([$id]);View::flash('success','User status updated.');View::redirect('/users');}
        if($action==='user_permissions_save'){if(!Auth::can('ADMIN'))throw new RuntimeException('Only an administrator can manage user permissions.');$uid=Validator::positiveInt($_POST['user_id']??null,'user');$target=$db->prepare('SELECT u.id,r.code role FROM users u JOIN roles r ON r.id=u.role_id WHERE u.id=?');$target->execute([$uid]);$target=$target->fetch();if(!$target)throw new InvalidArgumentException('User not found.');if($target['role']==='ADMIN')throw new RuntimeException('Administrators already have full access.');$valid=array_column($db->query('SELECT code FROM permissions')->fetchAll(),'code');$codes=array_values(array_intersect((array)($_POST['permissions']??[]),$valid));$db->beginTransaction();try{$db->prepare('DELETE FROM user_permissions WHERE user_id=?')->execute([$uid]);$ins=$db->prepare('INSERT INTO user_permissions(user_id,permission_code,granted_by)VALUES(?,?,?)');foreach($codes as $code)$ins->execute([$uid,$code,$user['id']]);$db->commit();}catch(Throwable $e){$db->rollBack();throw $e;}View::flash('success','Permissions updated.');View::redirect('/settings?tab=access');}
        if($action==='profile_save'){
            $uid=(int)$user['id'];
            $name=Validator::text($_POST['display_name']??'','full name',100);
            $email=Validator::text($_POST['email']??'','email address',150);
            if(!filter_var($email,FILTER_VALIDATE_EMAIL))throw new InvalidArgumentException('Enter a valid email address.');
            $dup=$db->prepare('SELECT id FROM users WHERE email=? AND id<>?');$dup->execute([$email,$uid]);if($dup->fetchColumn())throw new InvalidArgumentException('That email address is already in use.');
            $dupName=$db->prepare('SELECT id FROM users WHERE active=1 AND display_name=? AND id<>?');$dupName->execute([$name,$uid]);if($dupName->fetchColumn())throw new InvalidArgumentException('That full name is already in use by another active user — full names must be unique since they can be used to sign in.');
            $mobile=Validator::mobile($_POST['mobile']??'','mobile number');
            if($mobile!==null){$dupMobile=$db->prepare('SELECT id FROM users WHERE active=1 AND mobile=? AND id<>?');$dupMobile->execute([$mobile,$uid]);if($dupMobile->fetchColumn())throw new InvalidArgumentException('That mobile number is already in use by another active user.');}
            $db->prepare('UPDATE users SET display_name=?,email=?,mobile=? WHERE id=?')->execute([$name,$email,$mobile,$uid]);
            $sessionFields=['name'=>$name,'email'=>$email,'mobile'=>$mobile];
            if(!empty($_FILES['avatar']['tmp_name'])){
                if($_FILES['avatar']['size']>2*1024*1024||mime_content_type($_FILES['avatar']['tmp_name'])!=='image/webp')throw new InvalidArgumentException('Profile picture must be a WebP file under 2 MB.');
                $dir=dirname(__DIR__).'/storage/uploads/avatars'; if(!is_dir($dir))mkdir($dir,0775,true);
                $fn='avatar-'.$uid.'-'.bin2hex(random_bytes(5)).'.webp'; move_uploaded_file($_FILES['avatar']['tmp_name'],$dir.'/'.$fn);
                $db->prepare('UPDATE users SET avatar_path=? WHERE id=?')->execute([$fn,$uid]);
                $sessionFields['avatar']=$fn;
            }
            Auth::updateSessionUser($sessionFields);
            View::flash('success','Profile updated.');View::redirect('/settings?tab=profile');
        }
        if($action==='change_password'){
            $uid=(int)$user['id'];
            $current=(string)($_POST['current_password']??''); $new=(string)($_POST['new_password']??''); $confirm=(string)($_POST['confirm_password']??'');
            $hash=$db->prepare('SELECT password_hash FROM users WHERE id=?');$hash->execute([$uid]);$hash=$hash->fetchColumn();
            if(!$hash||!password_verify($current,$hash))throw new InvalidArgumentException('Current password is incorrect.');
            if(strlen($new)<8)throw new InvalidArgumentException('New password must be at least 8 characters.');
            if($new!==$confirm)throw new InvalidArgumentException('New password and confirm password do not match.');
            $db->prepare('UPDATE users SET password_hash=? WHERE id=?')->execute([password_hash($new,PASSWORD_DEFAULT),$uid]);
            View::flash('success','Password changed.');View::redirect($_SERVER['HTTP_REFERER']??'/');
        }
        if($action==='settings_save'){
            if(!Auth::allowed($db,'settings'))throw new RuntimeException('You do not have permission to manage settings.');
            $group=$_POST['group']??'business';
            $groups=['business'=>['canteen_name','business_name','phone','email','address','gst_number','currency_symbol'],'order'=>['order_number_format','order_number_auto','allow_order_cancellation','require_cancellation_reason','auto_free_table_after_completion'],'billing'=>['bill_number_format','bill_number_auto','payment_methods','show_logo_on_bill','show_waiter_name','show_table_number','show_thank_you_message','thank_you_message'],'discount'=>['discount_enabled','discount_allowed_types','discount_scope','discount_max_percent','discount_max_fixed','discount_approval_threshold_percent','discount_approval_threshold_fixed','complementary_enabled','complementary_roles','complementary_require_reason'],'system'=>['default_table_status','confirm_cancel_order','confirm_cancel_bill','confirm_disable_user'],'printer'=>['printer_paper_width','printer_auto_print','printer_auto_cut','printer_agent_url','printer_name','printer_counter_id']];
            if(!isset($groups[$group]))throw new InvalidArgumentException('Invalid settings group.');
            $checkbox=['order_number_auto','allow_order_cancellation','require_cancellation_reason','auto_free_table_after_completion','bill_number_auto','show_logo_on_bill','show_waiter_name','show_table_number','show_thank_you_message','confirm_cancel_order','confirm_cancel_bill','confirm_disable_user','discount_enabled','complementary_enabled','complementary_require_reason','printer_auto_print','printer_auto_cut'];
            $save=function(string $key,string $value)use($db,$user){$db->prepare('INSERT INTO settings(setting_key,setting_value,updated_by)VALUES(?,?,?) ON DUPLICATE KEY UPDATE setting_value=VALUES(setting_value),updated_by=VALUES(updated_by)')->execute([$key,$value,$user['id']]);};
            foreach($groups[$group] as $key){
                if(in_array($key,$checkbox,true))$value=!empty($_POST[$key])?'1':'0';
                elseif($key==='payment_methods'){$methods=array_values(array_intersect((array)($_POST['payment_methods']??[]),['CASH','UPI','OTHER']));if(!$methods)throw new InvalidArgumentException('Select at least one payment method.');$value=implode(',',$methods);}
                elseif($key==='discount_allowed_types'){$types=array_values(array_intersect((array)($_POST['discount_allowed_types']??[]),['PERCENT','FIXED']));$value=implode(',',$types);}
                elseif($key==='discount_scope')$value=in_array($_POST[$key]??'',['ORDER','ITEM','BOTH'],true)?$_POST[$key]:'BOTH';
                elseif($key==='complementary_roles'){$roles=array_values(array_intersect((array)($_POST['complementary_roles']??[]),['ADMIN','MANAGER','WAITER']));$value=implode(',',$roles);}
                elseif(in_array($key,['discount_max_percent','discount_max_fixed','discount_approval_threshold_percent','discount_approval_threshold_fixed'],true)){$raw=trim((string)($_POST[$key]??''));$value=$raw===''?'':(string)Validator::money($raw,'amount');}
                elseif($key==='default_table_status')$value=in_array($_POST[$key]??'',['AVAILABLE','RESERVED'],true)?$_POST[$key]:'AVAILABLE';
                elseif($key==='printer_paper_width')$value=($_POST[$key]??'')==='58'?'58':'80';
                elseif($key==='printer_agent_url'){$value=trim((string)($_POST[$key]??''));if($value!==''&&!filter_var($value,FILTER_VALIDATE_URL))throw new InvalidArgumentException('Printer agent address must be a valid URL, e.g. http://127.0.0.1:9123.');}
                elseif($key==='printer_name')$value=Validator::text($_POST[$key]??'','printer name',150,false);
                elseif($key==='printer_counter_id'){$raw=trim((string)($_POST[$key]??''));if($raw===''){$value='';}else{$cid=Validator::positiveInt($raw,'counter');$chk=$db->prepare('SELECT 1 FROM counters WHERE id=? AND active=1');$chk->execute([$cid]);if(!$chk->fetchColumn())throw new InvalidArgumentException('Invalid counter.');$value=(string)$cid;}}
                elseif($key==='email'){$value=trim((string)($_POST[$key]??''));if($value!==''&&!filter_var($value,FILTER_VALIDATE_EMAIL))throw new InvalidArgumentException('Invalid email address.');}
                elseif(in_array($key,['order_number_format','bill_number_format'],true)){$value=trim((string)($_POST[$key]??''));if($value===''||strpos($value,'{seq}')===false)throw new InvalidArgumentException('Number format must include {seq}, e.g. ORD-{seq}.');}
                else $value=trim((string)($_POST[$key]??''));
                $save($key,$value);
            }
            if($group==='business'&&!empty($_FILES['logo']['tmp_name'])){
                if($_FILES['logo']['size']>2*1024*1024||mime_content_type($_FILES['logo']['tmp_name'])!=='image/webp')throw new InvalidArgumentException('Logo must be a WebP file under 2 MB.');
                $dir=dirname(__DIR__).'/storage/uploads/business'; if(!is_dir($dir))mkdir($dir,0775,true);
                $fn='logo-'.bin2hex(random_bytes(5)).'.webp'; move_uploaded_file($_FILES['logo']['tmp_name'],$dir.'/'.$fn);
                $save('logo_path',$fn);
            }
            View::flash('success','Settings saved.');View::redirect('/settings?tab='.$group);
        }
        if($action==='settings_reset'){
            if(!Auth::allowed($db,'settings'))throw new RuntimeException('You do not have permission to manage settings.');
            $group=$_POST['group']??'';
            $defaults=[
                'business'=>['canteen_name'=>'Niyati Canteen','business_name'=>'','phone'=>'','email'=>'','address'=>'Bus Stand','gst_number'=>'','currency_symbol'=>'₹'],
                'order'=>['order_number_format'=>'ORD-{seq}','order_number_auto'=>'1','allow_order_cancellation'=>'1','require_cancellation_reason'=>'1','auto_free_table_after_completion'=>'1'],
                'billing'=>['bill_number_format'=>'BILL-{seq}','bill_number_auto'=>'1','payment_methods'=>'CASH,UPI','show_logo_on_bill'=>'1','show_waiter_name'=>'1','show_table_number'=>'1','show_thank_you_message'=>'1','thank_you_message'=>'Thank you for visiting Niyati Canteen!'],
                'discount'=>['discount_enabled'=>'1','discount_allowed_types'=>'PERCENT,FIXED','discount_scope'=>'BOTH','discount_max_percent'=>'20','discount_max_fixed'=>'500','discount_approval_threshold_percent'=>'10','discount_approval_threshold_fixed'=>''],
                'complementary'=>['complementary_enabled'=>'1','complementary_roles'=>'ADMIN,MANAGER','complementary_require_reason'=>'1'],
                'system'=>['default_table_status'=>'AVAILABLE','confirm_cancel_order'=>'1','confirm_cancel_bill'=>'1','confirm_disable_user'=>'1'],
                // auto_print defaults OFF: printing is only ever silent/automatic
                // once an admin has confirmed the local agent actually reaches a
                // real printer via Test Print — never on by default.
                'printer'=>['printer_paper_width'=>'80','printer_auto_print'=>'0','printer_auto_cut'=>'1','printer_agent_url'=>'http://127.0.0.1:9123','printer_name'=>'','printer_counter_id'=>''],
            ];
            if(!isset($defaults[$group]))throw new InvalidArgumentException('Invalid settings group.');
            $save=function(string $key,string $value)use($db,$user){$db->prepare('INSERT INTO settings(setting_key,setting_value,updated_by)VALUES(?,?,?) ON DUPLICATE KEY UPDATE setting_value=VALUES(setting_value),updated_by=VALUES(updated_by)')->execute([$key,$value,$user['id']]);};
            foreach($defaults[$group] as $key=>$value)$save($key,$value);
            View::flash('success','Settings reset to defaults.');View::redirect('/settings?tab='.$group);
        }
    } catch(Throwable $e){View::flash('error',$e->getMessage()); View::redirect($_SERVER['HTTP_REFERER']??'/');}}
    if(!Auth::check()){ require dirname(__DIR__).'/resources/views/login.php'; return; }
    // 'settings' is a base (ungated) page because My Profile — a personal
    // account tab every authenticated user needs regardless of role/
    // permissions — lives there. The other tabs (Business/Order/Billing/
    // Discount/User Access/System) stay properly protected: the frontend
    // only shows them to a user with the 'settings' permission (or ADMIN),
    // and settings_save/settings_reset independently re-check
    // Auth::allowed($db,'settings') server-side regardless of page access,
    // so this change grants no additional write capability to anyone.
    $request=array_merge($_GET,$_POST); $base=['tables','parcels','order','orders','bills','settings']; $gated=['dashboard','menu','categories','users','reports','cancelled','modified','audits']; $allowed=$base; foreach($gated as $g){if(Auth::allowed($db,$g))$allowed[]=$g;}
    $page=$request['page']??(Auth::can('ADMIN')?'dashboard':'tables'); if(!in_array($page,$allowed,true))$page=Auth::can('ADMIN')?'dashboard':'tables';
    if(isset($_GET['poll'])&&in_array($page,['tables','parcels'],true)){
        header('Content-Type: application/json'); header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0'); header('Pragma: no-cache');
        echo json_encode((new App\Services\PageDataService($db))->data($page,Auth::user(),$request)); return;
    }
    // Menu item images are picked from this fixed, server-controlled
    // library — never uploaded — so the picker needs a way to list what's
    // actually on disk (never hardcoded client-side, and never a path the
    // browser gets to supply). Same auth as menu_save itself.
    if(isset($_GET['images'])&&$page==='menu'){
        header('Content-Type: application/json'); header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0'); header('Pragma: no-cache');
        if(!Auth::allowed($db,'menu')){http_response_code(403); echo json_encode(['error'=>'Forbidden']); return;}
        $dir=$canteenImagesDir;
        $images=[];
        foreach(is_dir($dir)?scandir($dir):[] as $f){
            if($f==='.'||$f==='..')continue;
            if(!preg_match('/^[A-Za-z0-9 _\-\.]+\.webp$/',$f))continue;
            if(!is_file($dir.'/'.$f))continue;
            $images[]=$f;
        }
        sort($images,SORT_NATURAL|SORT_FLAG_CASE);
        echo json_encode(['images'=>$images]); return;
    }
    // Lets the browser that just created a print job (Test Print, or the
    // post-payment auto-print) check on its own job's outcome. Ordinary
    // session auth — this is the cashier's own browser, not a bridge — and
    // deliberately returns status/error only, never the payload, so a
    // receipt's bytes are never sent back over the wire a second time.
    if(isset($_GET['job_status'])){
        header('Content-Type: application/json'); header('Cache-Control: no-store');
        $job=(new PrintJobService($db))->status(Validator::positiveInt($_GET['job_status']??null,'job'));
        echo json_encode($job?:['status'=>'UNKNOWN']); return;
    }
    // no-store on every authenticated page response: without it, a browser
    // may serve this exact document back out of its back/forward cache (or
    // regular HTTP cache) on a Back/Forward navigation with no server round
    // trip at all — including after logout, when the session backing it no
    // longer exists. no-store makes every Back/Forward to an authenticated
    // URL re-request it from the server, so a destroyed session is always
    // re-checked and correctly bounced to the login view.
    header('Cache-Control: no-store, no-cache, must-revalidate'); header('Pragma: no-cache');
    $data=(new App\Services\PageDataService($db))->data($page,Auth::user(),$request); $boot=['page'=>$page,'user'=>Auth::user()+['permissions'=>Auth::permissions($db)],'csrf'=>Csrf::token(),'data'=>$data,'flash'=>['success'=>View::flash('success'),'error'=>View::flash('error'),'payment_success'=>View::flash('payment_success'),'bridge_token_created'=>View::flash('bridge_token_created')]]; require dirname(__DIR__).'/resources/views/app.php';
};
