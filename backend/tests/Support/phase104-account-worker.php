<?php

require dirname(__DIR__,2).'/vendor/autoload.php';
[$script,$database,$barrier,$status]=$argv;
$c=Tests\Support\Phase104Database::settings();
if(dirname($barrier)!==$c['directory'] || !in_array($status,['active','inactive'],true)) exit(2);
$pdo=Tests\Support\Phase104Database::connect($database);
echo "READY\n";
$deadline=microtime(true)+20;
while(!is_file($barrier)) { if(microtime(true)>$deadline) exit(3); usleep(10000); clearstatcache(true,$barrier); }
try {
    $stmt=$pdo->prepare('INSERT INTO users (first_name,last_name,email,password,role,status) VALUES (?,?,?,?,?,?)');
    $stmt->execute(['Synthetic','Concurrent',bin2hex(random_bytes(8)).'@example.test',bin2hex(random_bytes(32)),'super_admin',$status]);
    echo "UNEXPECTED_INSERT\n"; exit(4);
} catch(PDOException $e) {
    echo json_encode(['sqlstate'=>$e->errorInfo[0],'errno'=>(int)$e->errorInfo[1]],JSON_THROW_ON_ERROR)."\n";
}
