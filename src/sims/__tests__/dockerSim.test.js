import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createDockerSim } from '../dockerSim.js';
import { makeRunner } from './helpers.js';

let sim, missions, runner;

beforeEach(() => {
  missions = [];
  sim = createDockerSim({ onChange: vi.fn(), onMission: (id) => missions.push(id) });
  runner = makeRunner(sim);
});

describe('docker pull', () => {
  it('adds a known image and fires the pull mission', () => {
    const r = runner.run('docker pull nginx');
    expect(r.text).toContain('Downloaded newer image for nginx:latest');
    expect(sim.engine.getImage('nginx')).toBeTruthy();
    expect(missions).toContain('pull');
  });

  it('rejects unknown images', () => {
    const r = runner.run('docker pull not-a-real-image');
    expect(r.errors.join('')).toContain('pull access denied');
    expect(sim.engine.listImages().length).toBe(0);
  });
});

describe('docker run', () => {
  it('auto-pulls, creates a running container with ports and name', () => {
    const r = runner.run('docker run -d -p 8080:80 --name web nginx');
    expect(r.text).toContain("Unable to find image 'nginx:latest' locally");
    const c = sim.state.containers.find((x) => x.name === 'web');
    expect(c).toBeTruthy();
    expect(c.status).toBe('running');
    expect(c.ports[0].host).toBe('8080');
    expect(missions).toContain('run');
  });

  it('rejects duplicate names', () => {
    runner.run('docker run -d --name web nginx');
    const r = runner.run('docker run -d --name web nginx');
    expect(r.errors.join('')).toContain('already in use');
    expect(sim.state.containers.length).toBe(1);
  });

  it('oneshot images exit immediately', () => {
    runner.run('docker run hello-world');
    const c = sim.state.containers[0];
    expect(c.status).toBe('exited');
  });

  it('nvidia-smi without --gpus fails, with --gpus succeeds', () => {
    const fail = runner.run('docker run pytorch/pytorch nvidia-smi');
    expect(fail.errors.join('')).toContain('no NVIDIA driver detected');
    const ok = runner.run('docker run --gpus all pytorch/pytorch nvidia-smi');
    expect(ok.text).toContain('NVIDIA-SMI');
  });
});

describe('lifecycle', () => {
  beforeEach(() => runner.run('docker run -d -p 8080:80 --name web nginx'));

  it('ps shows running; ps -a includes exited', () => {
    expect(runner.run('docker ps').text).toContain('web');
    runner.run('docker stop web');
    expect(runner.run('docker ps').text).not.toContain('web');
    expect(runner.run('docker ps -a').text).toContain('Exited (0)');
  });

  it('cannot rm a running container; can after stop', () => {
    expect(runner.run('docker rm web').errors.length).toBe(1);
    runner.run('docker stop web');
    runner.run('docker rm web');
    expect(sim.state.containers.length).toBe(0);
    expect(missions).toContain('clean');
  });

  it('cannot rmi an image in use', () => {
    expect(runner.run('docker rmi nginx').errors.join('')).toContain('being used');
    runner.run('docker stop web');
    runner.run('docker rm web');
    runner.run('docker rmi nginx');
    expect(sim.engine.getImage('nginx')).toBeFalsy();
  });

  it('logs and exec work on the running container', () => {
    expect(runner.run('docker logs web').text).toContain('nginx');
    expect(missions).toContain('logs');
    expect(runner.run('docker exec web ls /').text).toContain('etc');
    expect(missions).toContain('exec');
  });

  it('curl reaches the published port', () => {
    expect(runner.run('curl localhost:8080').text).toContain('a container answered');
    expect(runner.run('curl localhost:9999').errors.length).toBe(1);
  });
});
