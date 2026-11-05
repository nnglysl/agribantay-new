<?php

namespace Tests\Unit;

use App\Services\PoultryHouseFoundationReadiness as Readiness;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

final class PoultryHouseReadinessContractTest extends TestCase
{
    public static function versions(): array
    {
        return [['8.0.46', 'mysql'], ['8.0.16', 'mysql'], ['8.0.15', null], ['9.0.0', null], ['5.7.44', null],
            ['11.8.9-MariaDB', 'mariadb'], ['5.5.5-11.8.9-MariaDB', 'mariadb'], ['11.8.8-MariaDB', null], ['8.0.46-MariaDB', null]];
    }

    #[DataProvider('versions')]
    public function test_actual_engine_and_version_select_an_explicit_contract(string $version, ?string $expected): void
    {
        $this->assertSame($expected, Readiness::engine($version));
    }

    public function test_exact_once_history_and_mixed_engine_rejection_without_fabricating_database_rows(): void
    {
        foreach (['mysql', 'mariadb'] as $engine) {
            $names = array_keys($engine === 'mysql' ? Readiness::MYSQL : Readiness::MARIADB);
            $other = array_keys($engine === 'mysql' ? Readiness::MARIADB : Readiness::MYSQL);
            $this->assertTrue(Readiness::validHistory($engine, $names));
            $this->assertFalse(Readiness::validHistory($engine, array_slice($names, 0, 3)));
            $this->assertFalse(Readiness::validHistory($engine, [...$names, $names[0]]));
            $this->assertFalse(Readiness::validHistory($engine, [...$names, $other[0]]));
            $this->assertFalse(Readiness::validHistory($engine, $other));
        }
    }
}
