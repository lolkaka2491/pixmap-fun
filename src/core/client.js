import Redis from 'ioredis';

const client = new Redis({
  host: 'localhost', // Change this to your Redis server host
  port: 6379, // Change this to your Redis server port
  // password: 'your_password', // Uncomment and add your password if required
});

export default client;
