<?php
declare(strict_types=1);
namespace AgriBantay\Installation;
use PDO;use RuntimeException;
use App\Services\PoultryHouseFoundationReadiness as Readiness;
use AgriBantay\Preparation\B1RecordIntegrity;
/** Additive read-only checks adapted from the reviewed fixture runner. No connection/DDL on import. */
final class FoundationInstallChecks
{
    public array $manifest;
    public function __construct(private string $backend){$this->manifest=require $backend.'/scripts/poultry-house-preparation/manifest.php';}
    public function verifyFiles(): array
    {
        $result = [];
        foreach ($this->manifest['files'] as $relative => $expected) {
            $path = realpath($this->backend.'/'.$relative);
            $root = realpath($this->backend);
            if (! $path || ! $root || ! str_starts_with(str_replace('\\', '/', $path), str_replace('\\', '/', $root).'/')
                || ! hash_equals($expected, hash_file('sha256', $path))) {
                throw new RuntimeException('STOP_HASH: '.$relative);
            }
            $result[$relative] = $path;
        }

        return $result;
    }

    public function baseline(PDO $pdo): array
    {
        $result = [];
        foreach ($pdo->query('SHOW TABLES')->fetchAll(PDO::FETCH_COLUMN) as $table) {
            if (! preg_match('/\A[a-z_][a-z0-9_]*\z/D', $table)) {
                throw new RuntimeException('STOP_IDENTIFIER');
            }
            if ($table === 'migrations') {
                continue; // Checked separately, including original IDs/duplicates/batches.
            }
            $columns = $pdo->query('SHOW COLUMNS FROM `'.$table.'`')->fetchAll(PDO::FETCH_COLUMN);
            $result[$table] = ['columns' => $columns, 'digest' => $this->digest($pdo, $table, $columns)];
        }

        return $result;
    }

    private function digest(PDO $pdo, string $table, array $columns): string
    {
        if(!preg_match('/\A[a-z_][a-z0-9_]*\z/D',$table))throw new RuntimeException('PH_IDENTIFIER');
        foreach($columns as $column)if(!preg_match('/\A[a-z_][a-z0-9_]*\z/D',$column))throw new RuntimeException('PH_IDENTIFIER');
        $rows=$pdo->query('SELECT `'.implode('`,`',$columns).'` FROM `'.$table.'`');$hashes=[];
        while(($row=$rows->fetch(PDO::FETCH_ASSOC))!==false)$hashes[]=B1RecordIntegrity::rowDigest($row);
        return B1RecordIntegrity::rowsDigest($hashes);
    }

    public static function baselineFromSnapshot(array $snapshot):array
    {
        $out=[];foreach($snapshot['tables'] as $table=>$entry)if($table!=='migrations')$out[$table]=['columns'=>array_column($entry['columns'],'COLUMN_NAME'),'digest'=>$entry['original_rows_sha256'],'metadata'=>$entry['columns'],'foreign_actions'=>$entry['foreign_actions'],'keys'=>$entry['keys']??[]];return $out;
    }

    public function preserved(PDO $pdo, array $baseline): void
    {
        foreach ($baseline as $table => $old) {
            if ($old['digest'] !== $this->digest($pdo, $table, $old['columns'])) {
                throw new RuntimeException('STOP_PRESERVATION: original fields changed.');
            }
            if(isset($old['metadata'])){
                $q=$pdo->prepare('SELECT COLUMN_NAME,ORDINAL_POSITION,COLUMN_DEFAULT,IS_NULLABLE,DATA_TYPE,CHARACTER_MAXIMUM_LENGTH,CHARACTER_OCTET_LENGTH,NUMERIC_PRECISION,NUMERIC_SCALE,DATETIME_PRECISION,CHARACTER_SET_NAME,COLLATION_NAME,COLUMN_TYPE,COLUMN_KEY,EXTRA,GENERATION_EXPRESSION,COLUMN_COMMENT FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? ORDER BY ORDINAL_POSITION');$q->execute([$table]);$current=array_column($q->fetchAll(PDO::FETCH_ASSOC),null,'COLUMN_NAME');
                foreach($old['metadata'] as $column){$actual=$current[$column['COLUMN_NAME']]??null;if($actual===null||self::strings($actual)!==self::strings($column))throw new RuntimeException('PH_ORIGINAL_COLUMN_METADATA');}
                $q=$pdo->prepare('SELECT CONSTRAINT_NAME,UNIQUE_CONSTRAINT_NAME,MATCH_OPTION,UPDATE_RULE,DELETE_RULE,REFERENCED_TABLE_NAME FROM information_schema.REFERENTIAL_CONSTRAINTS WHERE CONSTRAINT_SCHEMA=DATABASE() AND TABLE_NAME=? ORDER BY CONSTRAINT_NAME');$q->execute([$table]);$actions=array_column($q->fetchAll(PDO::FETCH_ASSOC),null,'CONSTRAINT_NAME');foreach($old['foreign_actions'] as $action)if(!isset($actions[$action['CONSTRAINT_NAME']])||self::strings($actions[$action['CONSTRAINT_NAME']])!==self::strings($action))throw new RuntimeException('PH_ORIGINAL_FOREIGN_ACTION');
                $q=$pdo->prepare('SELECT CONSTRAINT_NAME,COLUMN_NAME,ORDINAL_POSITION,POSITION_IN_UNIQUE_CONSTRAINT,REFERENCED_TABLE_NAME,REFERENCED_COLUMN_NAME FROM information_schema.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? ORDER BY CONSTRAINT_NAME,ORDINAL_POSITION');$q->execute([$table]);$keys=[];foreach($q->fetchAll(PDO::FETCH_ASSOC) as $key)$keys[$key['CONSTRAINT_NAME'].':'.$key['ORDINAL_POSITION']]=$key;foreach($old['keys']??[] as $key){$id=$key['CONSTRAINT_NAME'].':'.$key['ORDINAL_POSITION'];if(!isset($keys[$id])||self::strings($keys[$id])!==self::strings($key))throw new RuntimeException('PH_ORIGINAL_KEY_TUPLE');}
            }
        }
        foreach (['poultry_houses', 'poultry_house_initializations'] as $table) {
            if ((int) $pdo->query('SELECT COUNT(*) FROM `'.$table.'`')->fetchColumn() !== 0) {
                throw new RuntimeException('STOP_POPULATION: new inventory must remain empty.');
            }
        }
        if ((int) $pdo->query('SELECT COUNT(*) FROM farms WHERE last_house_number<>0 OR house_inventory_verified_at IS NOT NULL')->fetchColumn() !== 0) {
            throw new RuntimeException('STOP_POPULATION: legacy inventory must stay unknown.');
        }
    }

    public function journal(PDO $pdo): array
    {
        return $pdo->query('SELECT id,migration,batch FROM migrations ORDER BY id')->fetchAll();
    }

    public static function canonical(string $sql): string
    {
        // Preserve parentheses: different grouping must not pass as equivalent.
        return strtolower(preg_replace('/[\s`]+|_utf8mb4/', '', str_replace("\\'", "'", $sql)));
    }

    public function verifyObjects(PDO $pdo, int $unit): array
    {
        $evidence = [];
        foreach ($this->manifest['indexes'] as $name => [$table, $columns, $unique, $first]) {
            if ($first > $unit) {
                continue;
            }
            $q = $pdo->prepare('SELECT COLUMN_NAME,NON_UNIQUE FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? AND INDEX_NAME=? ORDER BY SEQ_IN_INDEX');
            $q->execute([$table, $name]);
            $rows = $q->fetchAll();
            if (implode(',', array_column($rows, 'COLUMN_NAME')) !== $columns || array_values(array_unique(array_map('intval',array_column($rows, 'NON_UNIQUE')))) !== [$unique ? 0 : 1]) {
                throw new RuntimeException('STOP_INDEX: '.$name);
            }
            $evidence['indexes'][$name] = $columns;
        }
        foreach ($this->manifest['foreign_keys'] as $name => [$table, $columns, $parent, $references, $first]) {
            if ($first > $unit) {
                continue;
            }
            $q = $pdo->prepare('SELECT COLUMN_NAME,REFERENCED_TABLE_NAME,REFERENCED_COLUMN_NAME FROM information_schema.KEY_COLUMN_USAGE WHERE CONSTRAINT_SCHEMA=DATABASE() AND TABLE_NAME=? AND CONSTRAINT_NAME=? ORDER BY ORDINAL_POSITION');
            $q->execute([$table, $name]);
            $rows = $q->fetchAll();
            $r = $pdo->prepare('SELECT UPDATE_RULE,DELETE_RULE FROM information_schema.REFERENTIAL_CONSTRAINTS WHERE CONSTRAINT_SCHEMA=DATABASE() AND CONSTRAINT_NAME=?');
            $r->execute([$name]);
            if (implode(',', array_column($rows, 'COLUMN_NAME')) !== $columns
                || array_unique(array_column($rows, 'REFERENCED_TABLE_NAME')) !== [$parent]
                || implode(',', array_column($rows, 'REFERENCED_COLUMN_NAME')) !== $references
                || $r->fetch() !== ['UPDATE_RULE' => 'RESTRICT', 'DELETE_RULE' => 'RESTRICT']) {
                throw new RuntimeException('STOP_FK: '.$name);
            }
            $evidence['foreign_keys'][$name] = [$table, $columns, $parent, $references, 'RESTRICT'];
        }
        foreach ($this->manifest['checks'] as $name => [$expression, $first]) {
            if ($first > $unit) {
                continue;
            }
            $q = $pdo->prepare('SELECT c.CHECK_CLAUSE,t.ENFORCED FROM information_schema.CHECK_CONSTRAINTS c JOIN information_schema.TABLE_CONSTRAINTS t USING(CONSTRAINT_SCHEMA,CONSTRAINT_NAME) WHERE c.CONSTRAINT_SCHEMA=DATABASE() AND c.CONSTRAINT_NAME=?');
            $q->execute([$name]);
            $row = $q->fetch();
            if (! $row || $row['ENFORCED'] !== 'YES' || self::canonical($row['CHECK_CLAUSE']) !== self::canonical($expression)) {
                throw new RuntimeException('STOP_CHECK: '.$name);
            }
            $evidence['checks'][$name] = $row;
        }
        foreach ($this->manifest['triggers'] as $name => [$table, $event, $first, $marker]) {
            if ($first > $unit) {
                continue;
            }
            $path = array_keys($this->manifest['files'])[$first - 1];
            $source = file_get_contents($this->backend.'/'.$path);
            $start = strpos($source, $marker);
            if ($start === false || ! preg_match('/BEGIN.*?END"\);/s', substr($source, $start), $body)) {
                throw new RuntimeException('STOP_TRIGGER_SOURCE');
            }
            $expected = substr($body[0], 0, -3); // Remove PHP closing quote, paren, semicolon.
            $q = $pdo->prepare('SELECT EVENT_OBJECT_TABLE,EVENT_MANIPULATION,ACTION_TIMING,ACTION_STATEMENT,(DEFINER=CURRENT_USER()) AS creator_matches FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA=DATABASE() AND TRIGGER_NAME=?');
            $q->execute([$name]);
            $row = $q->fetch();
            if (! $row || $row['EVENT_OBJECT_TABLE'] !== $table || $row['EVENT_MANIPULATION'] !== $event
                || $row['ACTION_TIMING'] !== 'BEFORE' || (int) $row['creator_matches'] !== 1
                || self::canonical($row['ACTION_STATEMENT']) !== self::canonical($expected)) {
                throw new RuntimeException('STOP_TRIGGER: '.$name);
            }
            $evidence['triggers'][$name] = ['body_sha256' => hash('sha256', $row['ACTION_STATEMENT']), 'creator_matches' => true];
        }
        if ($unit >= 3) {
            $slot = $pdo->query("SELECT EXTRA,GENERATION_EXPRESSION FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='sensors' AND COLUMN_NAME='active_house_slot'")->fetch();
            if (! $slot || $slot['EXTRA'] !== 'STORED GENERATED'
                || self::canonical($slot['GENERATION_EXPRESSION']) !== self::canonical("(CASE WHEN (status='Active') THEN poultry_house_id ELSE NULL END)")) {
                throw new RuntimeException('STOP_GENERATION');
            }
            $evidence['generated_slot'] = $slot;
        }
        $units = ['farms' => 1, 'device_assignment_events' => 2, 'sensors' => 3, 'sensor_readings' => 4, 'alert_history' => 4];
        foreach ($this->manifest['columns'] as $table => $columns) {
            if ($units[$table] > $unit) {
                continue;
            }
            foreach ($columns as $column) {
                if ($column === 'last_house_number' || $column === 'active_house_slot') {
                    continue;
                }
                if ((int) $pdo->query('SELECT COUNT(*) FROM `'.$table.'` WHERE `'.$column.'` IS NOT NULL')->fetchColumn() !== 0) {
                    throw new RuntimeException('STOP_ATTRIBUTION: legacy context must stay NULL.');
                }
            }
        }

        return $evidence;
    }

    private static function strings(array $row):array {return array_map(static fn($v)=>$v===null?null:(string)$v,$row);}

    /** Exact MySQL procedure certification, including the gap in the older maintenance helper. */
    public function verifyProcedure(PDO $pdo,string $creatorHash):array
    {
        $q=$pdo->prepare('SELECT ROUTINE_DEFINITION,SECURITY_TYPE,SQL_DATA_ACCESS,DEFINER,ROUTINE_TYPE FROM information_schema.ROUTINES WHERE ROUTINE_SCHEMA=DATABASE() AND ROUTINE_NAME=?');$q->execute([Readiness::AUDIT_PROCEDURE]);$rows=$q->fetchAll(PDO::FETCH_ASSOC);$sql=Readiness::auditProcedureSql('mysql');$body=substr($sql,strpos($sql,'BEGIN'));
        if(count($rows)!==1)throw new RuntimeException('PH_PROCEDURE_COUNT');$row=$rows[0];
        if($row['ROUTINE_TYPE']!=='PROCEDURE'||$row['SECURITY_TYPE']!=='DEFINER'||$row['SQL_DATA_ACCESS']!=='READS SQL DATA'||!$row['ROUTINE_DEFINITION']||self::canonical($row['ROUTINE_DEFINITION'])!==self::canonical($body))throw new RuntimeException('PH_PROCEDURE_DEFINITION');
        if(!hash_equals($creatorHash,hash('sha256',$row['DEFINER'])))throw new RuntimeException('PH_PROCEDURE_CREATOR');
        $q=$pdo->prepare('SELECT COUNT(*) FROM information_schema.PARAMETERS WHERE SPECIFIC_SCHEMA=DATABASE() AND SPECIFIC_NAME=?');$q->execute([Readiness::AUDIT_PROCEDURE]);if((int)$q->fetchColumn()!==0)throw new RuntimeException('PH_PROCEDURE_PARAMETERS');
        $triggers=$pdo->query('SELECT TRIGGER_NAME,DEFINER FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA=DATABASE()')->fetchAll(PDO::FETCH_ASSOC);if(count($triggers)!==4)throw new RuntimeException('PH_TRIGGER_COUNT');$names=array_keys(Readiness::triggerContract('mysql'));foreach($triggers as $trigger)if(!in_array($trigger['TRIGGER_NAME'],$names,true)||$trigger['DEFINER']!==$row['DEFINER'])throw new RuntimeException('PH_COMMON_DEFINER');
        return ['passed'=>true,'exact_body'=>true,'zero_parameters'=>true,'common_durable_creator'=>true,'sql_sha256'=>hash('sha256',$sql)];
    }

    public function foreignIntegrity(PDO $pdo):array
    {
        $rows=$pdo->query('SELECT TABLE_NAME,CONSTRAINT_NAME,COLUMN_NAME,REFERENCED_TABLE_NAME,REFERENCED_COLUMN_NAME,ORDINAL_POSITION FROM information_schema.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA=DATABASE() AND REFERENCED_TABLE_NAME IS NOT NULL ORDER BY TABLE_NAME,CONSTRAINT_NAME,ORDINAL_POSITION')->fetchAll(PDO::FETCH_ASSOC);$groups=[];
        foreach($rows as $r){foreach(['TABLE_NAME','COLUMN_NAME','REFERENCED_TABLE_NAME','REFERENCED_COLUMN_NAME'] as $key)if(!preg_match('/\A[a-z_][a-z0-9_]*\z/D',$r[$key]))throw new RuntimeException('PH_IDENTIFIER');$groups[$r['TABLE_NAME'].'.'.$r['CONSTRAINT_NAME']][]=$r;}
        foreach($groups as $columns){$joins=$nonnull=[];foreach($columns as $c){$joins[]='c.`'.$c['COLUMN_NAME'].'`=p.`'.$c['REFERENCED_COLUMN_NAME'].'`';$nonnull[]='c.`'.$c['COLUMN_NAME'].'` IS NOT NULL';}$c=$columns[0];if((int)$pdo->query('SELECT COUNT(*) FROM `'.$c['TABLE_NAME'].'` c LEFT JOIN `'.$c['REFERENCED_TABLE_NAME'].'` p ON '.implode(' AND ',$joins).' WHERE '.implode(' AND ',$nonnull).' AND p.`'.$c['REFERENCED_COLUMN_NAME'].'` IS NULL')->fetchColumn())throw new RuntimeException('PH_FOREIGN_ORPHAN');}
        return ['relationships'=>count($groups),'orphans'=>0];
    }

    private function checkpoint($stream, array $value): void
    {
        $line = json_encode(['utc' => gmdate('c'), ...$value], JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES).PHP_EOL;
        if (fwrite($stream, $line) !== strlen($line) || ! fflush($stream) || ! fsync($stream)) {
            throw new RuntimeException('STOP_CHECKPOINT_IO: inspect database before any retry.');
        }
    }
}
