import asyncio
import importlib.util
import json
import os
from pathlib import Path
import sys
import threading
import unittest
from unittest.mock import patch
import websockets

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "hardware-pi"))
spec = importlib.util.spec_from_file_location("tap_broadcaster", ROOT / "hardware-pi/tap-broadcaster.py")
reader = importlib.util.module_from_spec(spec)
spec.loader.exec_module(reader)


class ReaderReconnectTest(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        reader.shutdown_event = asyncio.Event()
        reader.card_state.reset()

    async def test_failed_send_raises_to_network_owner(self):
        async def handler(socket):
            await socket.close()
        async with websockets.serve(handler, "127.0.0.1", 0) as server:
            port = server.sockets[0].getsockname()[1]
            async with websockets.connect(f"ws://127.0.0.1:{port}") as socket:
                await socket.wait_closed()
                with self.assertRaises(websockets.exceptions.ConnectionClosed):
                    await reader.broadcast_tap_ws(socket, "OLD", "reader-1")

    async def test_idle_disconnect_reauthenticates_and_delivers_only_fresh_uid(self):
        authenticated = asyncio.Queue()
        received = asyncio.Queue()
        active = []
        async def handler(socket):
            active.append(socket)
            auth = json.loads(await socket.recv())
            self.assertEqual(auth["secret"], "test-secret")
            await socket.send(json.dumps({"type": "auth_success"}))
            await authenticated.put(socket)
            try:
                async for message in socket:
                    await received.put(json.loads(message)["card_uid"])
            except websockets.exceptions.ConnectionClosed:
                pass
        server = await websockets.serve(handler, "127.0.0.1", 0)
        port = server.sockets[0].getsockname()[1]
        started = threading.Event()
        release = threading.Event()
        reads = 0
        def read_uid(_device):
            nonlocal reads
            reads += 1
            if reads == 1:
                started.set()
                release.wait(5)
                return "OLD"
            if reads == 2:
                return "FRESH"
            return None
        with patch.object(reader, "read_uid_from_pn532", read_uid):
            task = asyncio.create_task(reader.websocket_broadcaster(f"http://127.0.0.1:{port}", "test-secret", "reader-1", "fake-uid-boundary", False))
            try:
                await asyncio.wait_for(authenticated.get(), 5)
                self.assertTrue(await asyncio.to_thread(started.wait, 5))
                server.close()
                await server.wait_closed()
                server = await websockets.serve(handler, "127.0.0.1", port)
                await asyncio.wait_for(authenticated.get(), 5)
                release.set()
                self.assertEqual(await asyncio.wait_for(received.get(), 5), "FRESH")
                self.assertTrue(received.empty())
                reader.shutdown_event.set()
                await asyncio.wait_for(task, 5)
            finally:
                release.set()
                task.cancel()
                await asyncio.gather(task, return_exceptions=True)
                server.close()
                await server.wait_closed()
    async def test_hardware_read_failure_recovers_without_reconnecting_network(self):
        received = asyncio.Event()
        connections = 0
        async def handler(socket):
            nonlocal connections
            connections += 1
            await socket.recv()
            await socket.send(json.dumps({"type": "auth_success"}))
            self.assertEqual(json.loads(await socket.recv())["card_uid"], "RECOVERED")
            received.set()
            await socket.wait_closed()
        reads = 0
        def read_uid(_device):
            nonlocal reads
            reads += 1
            if reads == 1:
                raise OSError("hardware read error")
            return "RECOVERED" if reads == 2 else None
        async with websockets.serve(handler, "127.0.0.1", 0) as server:
            port = server.sockets[0].getsockname()[1]
            with patch.object(reader, "read_uid_from_pn532", read_uid):
                task = asyncio.create_task(reader.websocket_broadcaster(f"http://127.0.0.1:{port}", "test", "reader-1", "fake-uid-boundary", False))
                try:
                    await asyncio.wait_for(received.wait(), 5)
                    self.assertEqual(connections, 1)
                    reader.shutdown_event.set()
                    await asyncio.wait_for(task, 5)
                finally:
                    task.cancel()
                    await asyncio.gather(task, return_exceptions=True)


    async def test_simulation_eof_and_quit_exit_without_input_threads(self):
        for content in [b"", b"quit\n"]:
            stream = asyncio.StreamReader()
            stream.feed_data(content)
            stream.feed_eof()
            await asyncio.wait_for(reader.simulation_mode(None, "reader-1", stdin=stream), 1)


if __name__ == "__main__":
    unittest.main()
