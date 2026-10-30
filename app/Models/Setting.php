<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Setting extends Model
{
    protected $fillable = ['key', 'value'];

    private static array $cache = [];

    public static function get(string $key, mixed $default = null): mixed
    {
        if (array_key_exists($key, self::$cache)) {
            return self::$cache[$key];
        }

        $setting = static::where('key', $key)->first();

        if (! $setting) {
            return $default;
        }

        return self::$cache[$key] = self::decode($setting->value);
    }

    public static function set(string $key, mixed $value): void
    {
        $encoded = is_array($value) || is_object($value)
            ? json_encode($value)
            : (string) $value;

        static::updateOrCreate(
            ['key' => $key],
            ['value' => $encoded]
        );

        self::$cache[$key] = $value;
    }

    /**
     * Warm the static cache with a single query and return the key/value map.
     *
     * Callers that need the whole table (e.g. the settings index) must use the
     * returned map: reading `static::all()` afterwards would be a second query,
     * and reading `self::$cache` would leak keys that no longer exist.
     *
     * @return array<string, mixed>
     */
    public static function prime(): array
    {
        $values = [];

        foreach (static::all() as $setting) {
            $values[$setting->key] = self::$cache[$setting->key] = self::decode($setting->value);
        }

        return $values;
    }

    private static function decode(mixed $value): mixed
    {
        $decoded = is_string($value) ? json_decode($value, true) : $value;

        return $decoded !== null ? $decoded : $value;
    }
}
