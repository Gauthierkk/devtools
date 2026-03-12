"""Module registry — registers all backend modules."""

from rpc import RpcServer
from modules.json_tool import handlers as json_tool
from modules.port_monitor import handlers as port_monitor
from modules.speed_test import handlers as speed_test
from modules.networking_stats import handlers as networking_stats
from modules.cron_manager import handlers as cron_manager


def register_all_modules(server: RpcServer):
    json_tool.register(server)
    port_monitor.register(server)
    speed_test.register(server)
    networking_stats.register(server)
    cron_manager.register(server)
