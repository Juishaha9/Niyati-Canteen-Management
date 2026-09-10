<?php
namespace App\Services;
use PDO;
final class AuditService {
    public function __construct(private PDO $db) {}
    public function order(int $orderId, int $userId, string $action, mixed $old=null, mixed $new=null, ?string $reason=null): void { $this->write('order_audits',$orderId,$userId,$action,$old,$new,$reason); }
    public function bill(int $orderId, int $userId, string $action, mixed $old=null, mixed $new=null, ?string $reason=null): void { $this->write('bill_audits',$orderId,$userId,$action,$old,$new,$reason); }
    private function write(string $table,int $orderId,int $userId,string $action,mixed $old,mixed $new,?string $reason): void { $s=$this->db->prepare("INSERT INTO {$table}(order_id,user_id,action,old_values,new_values,reason) VALUES(?,?,?,?,?,?)"); $s->execute([$orderId,$userId,$action,$old===null?null:json_encode($old),$new===null?null:json_encode($new),$reason]); }
}
