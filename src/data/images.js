/* AUTO-GENERATED from docker-k8s-lab.html — data structures */
export const KNOWN_IMAGES={
  "nginx":{size:"192MB",port:80,logs:["/docker-entrypoint.sh: Configuration complete; ready for start up","2026/07/07 09:12:01 [notice] 1#1: nginx/1.27.0","2026/07/07 09:12:01 [notice] 1#1: start worker processes"]},
  "redis":{size:"117MB",port:6379,logs:["1:C 07 Jul 2026 09:12:01.000 * Redis version=7.4.0","1:M 07 Jul 2026 09:12:01.002 * Ready to accept connections tcp"]},
  "postgres":{size:"438MB",port:5432,logs:["PostgreSQL init process complete; ready for start up.","LOG:  database system is ready to accept connections"],env:"POSTGRES_PASSWORD"},
  "ubuntu":{size:"78.1MB",port:null,logs:[],oneshot:true},
  "hello-world":{size:"13.3kB",port:null,logs:["Hello from Docker!","This message shows that your installation appears to be working correctly."],oneshot:true},
  "pytorch/pytorch":{size:"6.94GB",port:null,logs:["PyTorch 2.7.0 available","CUDA available: True (1 device)"],gpu:true},
  "python":{size:"1.02GB",port:null,logs:["Python 3.12.4"],oneshot:true},
};
