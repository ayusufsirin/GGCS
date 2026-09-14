#!/usr/bin/env bash
set -euo pipefail

# ROS/ament setup scripts may read optional variables before defining them.
# Disable nounset only while sourcing trusted environment setup, then restore
# strict mode for the GGCS-owned fixture logic below.
set +u
source "/opt/ros/${ROS_DISTRO}/setup.bash"
source /opt/ggcs_ws/install/setup.bash
set -u

cleanup() {
  if [[ -n "${ROSBRIDGE_PID:-}" ]]; then
    kill "${ROSBRIDGE_PID}" 2>/dev/null || true
    wait "${ROSBRIDGE_PID}" 2>/dev/null || true
  fi
}
trap cleanup EXIT INT TERM

ros2 launch rosbridge_server rosbridge_websocket_launch.xml \
  call_services_in_new_thread:=true \
  default_call_service_timeout:=5.0 \
  send_action_goals_in_new_thread:=true &
ROSBRIDGE_PID=$!

python3 /opt/ggcs/fixture.py
