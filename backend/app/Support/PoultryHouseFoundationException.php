<?php

namespace App\Support;

/** Internal fixed reason codes only; never return database exception text to callers. */
final class PoultryHouseFoundationException extends \RuntimeException {}
