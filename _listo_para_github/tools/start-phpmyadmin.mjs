import net from 'node:net';
import { spawn } from 'node:child_process';

const socketPath = process.env.MYSQL_SOCKET_PATH || '/tmp/maga-mysql.sock';
const phpBin = process.env.PHP_BIN || '/Applications/XAMPP/xamppfiles/bin/php';
const phpmyadminDir = process.env.PHPMYADMIN_DIR || '/Applications/XAMPP/xamppfiles/phpmyadmin';
const probe = net.createConnection(socketPath);
probe.on('error', err => {
  console.error('MySQL socket connection failed:', err.message);
  process.exit(1);
});
probe.on('connect', () => {
  probe.end();
  const php = spawn(
    phpBin,
    [
      '-d', `mysqli.default_socket=${socketPath}`,
      '-d', `pdo_mysql.default_socket=${socketPath}`,
      '-d', 'error_reporting=E_ALL & ~E_DEPRECATED & ~E_NOTICE',
      '-S', '127.0.0.1:8080',
      '-t', phpmyadminDir
    ],
    { stdio: 'inherit' }
  );
  setTimeout(() => {
    spawn('open', ['http://127.0.0.1:8080/index.php?route=/database/structure&db=maga'], { stdio: 'ignore' });
  }, 600);
  php.on('exit', code => process.exit(code ?? 0));
});

