<?php
namespace App\Services;
use PDO;

// Server-mediated print queue: PWA -> this service -> counter's Niyati
// Print Bridge -> printer. The PHP backend never talks to a printer
// directly (Hostinger has no route to a USB device on a counter PC) — it
// only stores a job and lets the correct bridge poll, claim, and report on
// it. Two request styles use this service:
//  - Human/browser requests (session-authenticated via Auth::check() in
//    routes/web.php, same as every other action) create jobs and issue
//    bridge tokens.
//  - Bridge requests (Bearer-token authenticated, no PHP session — a
//    background Windows process has no cookie jar) poll for work and
//    report back. authenticateBridge() is the only entry point a caller
//    without a session can reach; every other bridge-facing method here
//    requires a counter_id already proven to belong to that token.
final class PrintJobService {
    public function __construct(private PDO $db) {}

    // ===== Human-facing =====

    // Creates a print job for an ALREADY-PAID order. Idempotent per
    // order+job_type: a second call while a job is still QUEUED/PROCESSING
    // returns that same job instead of creating a duplicate — this is what
    // makes a double-click or a payment-page refresh safe, without needing
    // any client-side de-duplication of its own. The only thing this method
    // trusts from outside is order_id, and even that is only used to look
    // the order back up here; $escposBase64 is stored purely as a rendering
    // artifact (the receipt bytes), never read back as a source of money.
    public function create(int $orderId, int $counterId, string $paperWidth, string $escposBase64, int $userId): array {
        $order = $this->one('SELECT id,status FROM orders WHERE id=?', [$orderId]);
        if (!$order) throw new \InvalidArgumentException('Order not found.');
        if ($order['status'] !== 'PAID') throw new \InvalidArgumentException('Only a paid bill can be sent to print.');
        $counter = $this->one('SELECT id FROM counters WHERE id=? AND active=1', [$counterId]);
        if (!$counter) throw new \InvalidArgumentException('Invalid or inactive counter.');
        $existing = $this->one("SELECT id,status FROM print_jobs WHERE order_id=? AND job_type='RECEIPT' AND status IN ('QUEUED','PROCESSING') ORDER BY id DESC LIMIT 1", [$orderId]);
        if ($existing) return ['job_id' => (int)$existing['id'], 'status' => $existing['status'], 'deduped' => true];
        $paperWidth = $paperWidth === '58' ? '58' : '80';
        if ($escposBase64 === '' || !preg_match('/^[A-Za-z0-9+\/=]+$/', $escposBase64)) throw new \InvalidArgumentException('Invalid print payload.');
        $stmt = $this->db->prepare('INSERT INTO print_jobs(counter_id,order_id,job_type,paper_width,payload,status,created_by) VALUES(?,?,?,?,?,?,?)');
        $stmt->execute([$counterId, $orderId, 'RECEIPT', $paperWidth, $escposBase64, 'QUEUED', $userId]);
        return ['job_id' => (int)$this->db->lastInsertId(), 'status' => 'QUEUED', 'deduped' => false];
    }

    // Status only — never returns the payload itself, so a browser polling
    // for its own job's result never has to receive (or risk logging) the
    // receipt bytes a second time.
    // Settings > Printer > Test Print never touches a real bill, so it has
    // no order_id at all (the column is nullable specifically for this).
    // Not deduplicated like create() above — a deliberate repeated Test
    // Print is exactly that, not an accidental double-click on a payment.
    public function createTest(int $counterId, string $paperWidth, string $escposBase64, int $userId): array {
        $counter = $this->one('SELECT id FROM counters WHERE id=? AND active=1', [$counterId]);
        if (!$counter) throw new \InvalidArgumentException('Invalid or inactive counter.');
        if ($escposBase64 === '' || !preg_match('/^[A-Za-z0-9+\/=]+$/', $escposBase64)) throw new \InvalidArgumentException('Invalid print payload.');
        $paperWidth = $paperWidth === '58' ? '58' : '80';
        $stmt = $this->db->prepare("INSERT INTO print_jobs(counter_id,order_id,job_type,paper_width,payload,status,created_by) VALUES(?,NULL,'TEST',?,?,'QUEUED',?)");
        $stmt->execute([$counterId, $paperWidth, $escposBase64, $userId]);
        return ['job_id' => (int)$this->db->lastInsertId(), 'status' => 'QUEUED'];
    }

    public function status(int $jobId): ?array {
        return $this->one('SELECT id,order_id,counter_id,status,last_error,created_at,printed_at FROM print_jobs WHERE id=?', [$jobId]);
    }

    public function counters(): array {
        return $this->all('SELECT c.id,c.name,c.active,pb.id bridge_id,pb.bridge_code,pb.printers_json,pb.last_seen_at FROM counters c LEFT JOIN print_bridges pb ON pb.counter_id=c.id WHERE c.active=1 ORDER BY c.sort_order,c.name');
    }

    // Raw token is returned exactly once, here — only its hash is ever
    // persisted (same pattern as password_hash elsewhere in this app), so
    // it cannot be recovered from the database afterward, only reissued.
    public function generateBridgeToken(int $counterId, int $adminUserId): array {
        $counter = $this->one('SELECT id FROM counters WHERE id=?', [$counterId]);
        if (!$counter) throw new \InvalidArgumentException('Counter not found.');
        $token = bin2hex(random_bytes(24));
        $code = 'BRIDGE-' . strtoupper(bin2hex(random_bytes(4)));
        $stmt = $this->db->prepare('INSERT INTO print_bridges(counter_id,bridge_code,token_hash,created_by) VALUES(?,?,?,?)');
        $stmt->execute([$counterId, $code, hash('sha256', $token), $adminUserId]);
        return ['bridge_id' => (int)$this->db->lastInsertId(), 'bridge_code' => $code, 'token' => $token];
    }

    public function revokeBridge(int $bridgeId): void {
        $this->db->prepare('DELETE FROM print_bridges WHERE id=?')->execute([$bridgeId]);
    }

    // ===== Bridge-facing (no PHP session — Bearer token only) =====

    // The token itself is a 24-byte random value (bin2hex'd for transport);
    // only its SHA-256 digest is ever stored, so this looks the digest up
    // directly rather than comparing raw values — there is nothing here to
    // time-compare against attacker-controlled input the way a raw
    // string-equality check on a password would need hash_equals() for.
    public function authenticateBridge(?string $token): ?array {
        if (!$token || !preg_match('/^[a-f0-9]{48}$/', $token)) return null;
        $row = $this->one('SELECT id,counter_id FROM print_bridges WHERE token_hash=?', [hash('sha256', $token)]);
        if (!$row) return null;
        return $row;
    }

    public function touchBridge(int $bridgeId, array $printers = []): void {
        if ($printers) {
            $this->db->prepare('UPDATE print_bridges SET last_seen_at=NOW(),printers_json=? WHERE id=?')->execute([json_encode(array_values(array_map('strval', $printers))), $bridgeId]);
        } else {
            $this->db->prepare('UPDATE print_bridges SET last_seen_at=NOW() WHERE id=?')->execute([$bridgeId]);
        }
    }

    // A bridge only ever sees its OWN counter's queue — counter_id here
    // comes from authenticateBridge()'s result, never from client input.
    // Deliberately excludes `payload` — the poll response is a lightweight
    // "here's what's waiting" list; the actual receipt bytes are only ever
    // handed over by claim() below, to whichever single bridge wins the
    // atomic claim on a given job.
    public function queuedFor(int $counterId): array {
        return $this->all("SELECT id,order_id,job_type,paper_width FROM print_jobs WHERE counter_id=? AND status='QUEUED' ORDER BY id LIMIT 5", [$counterId]);
    }

    // Atomic claim: the UPDATE's WHERE clause (id=? AND counter_id=? AND
    // status='QUEUED') is what makes two overlapping bridge polls safe —
    // InnoDB serializes concurrent UPDATEs to the same row, so only the
    // first one to reach this statement can still find status='QUEUED';
    // the second sees rowCount()===0 and gets nothing, never a duplicate
    // claim on the same job.
    public function claim(int $jobId, int $counterId, int $bridgeId): ?array {
        $stmt = $this->db->prepare("UPDATE print_jobs SET status='PROCESSING',claimed_by=?,claimed_at=NOW(),attempts=attempts+1 WHERE id=? AND counter_id=? AND status='QUEUED'");
        $stmt->execute([$bridgeId, $jobId, $counterId]);
        if ($stmt->rowCount() === 0) return null;
        return $this->one('SELECT id,order_id,job_type,paper_width,payload FROM print_jobs WHERE id=?', [$jobId]);
    }

    public function complete(int $jobId, int $counterId): bool {
        $stmt = $this->db->prepare("UPDATE print_jobs SET status='PRINTED',printed_at=NOW() WHERE id=? AND counter_id=? AND status='PROCESSING'");
        $stmt->execute([$jobId, $counterId]);
        return $stmt->rowCount() > 0;
    }

    public function fail(int $jobId, int $counterId, string $error): bool {
        $stmt = $this->db->prepare("UPDATE print_jobs SET status='FAILED',last_error=? WHERE id=? AND counter_id=? AND status='PROCESSING'");
        $stmt->execute([mb_substr($error, 0, 500), $jobId, $counterId]);
        return $stmt->rowCount() > 0;
    }

    private function one(string $sql, array $a = []): ?array { $s = $this->db->prepare($sql); $s->execute($a); return $s->fetch() ?: null; }
    private function all(string $sql, array $a = []): array { $s = $this->db->prepare($sql); $s->execute($a); return $s->fetchAll(); }
}
