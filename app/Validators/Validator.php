<?php
namespace App\Validators;
final class Validator {
    public static function positiveInt(mixed $value, string $field): int { $v=filter_var($value,FILTER_VALIDATE_INT,['options'=>['min_range'=>1]]); if ($v===false) throw new \InvalidArgumentException("Invalid {$field}."); return $v; }
    public static function money(mixed $value, string $field, bool $nullable=false): ?float { if ($nullable && ($value === null || $value === '')) return null; if (!is_numeric($value) || (float)$value<0) throw new \InvalidArgumentException("Invalid {$field}."); return round((float)$value,2); }
    public static function text(mixed $value, string $field, int $max=500, bool $required=true): string { $v=trim((string)$value); if (($required && $v==='') || mb_strlen($v)>$max) throw new \InvalidArgumentException("Invalid {$field}."); return $v; }
    public static function mobile(mixed $value, string $field, bool $required=false): ?string { $v=trim((string)$value); if ($v==='') { if ($required) throw new \InvalidArgumentException("Invalid {$field}."); return null; } if (!preg_match('/^[0-9]{7,15}$/',$v)) throw new \InvalidArgumentException("Invalid {$field}."); return $v; }
}
