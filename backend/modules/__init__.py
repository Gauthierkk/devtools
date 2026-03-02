"""Module registry — registers all backend modules."""

from rpc import RpcServer
from modules.json_tool import handlers as json_tool
from modules.port_monitor import handlers as port_monitor


def register_all_modules(server: RpcServer):
    json_tool.register(server)
    port_monitor.register(server)
