import { Entity } from "./interfaces";

export const config: Entity = {
  tabs: {
    items: {
      settings: {
        label: "Settings",
        widget: {
          name: "settings",
          config: {}
        }
      },
      home: {
        label: "Home",
        grids: {
          horizontal: 12,
          vertical: 8,
          items: {
            map: {
              label: "Map",
              width: 8,
              height: 8,
              x: 4,
              y: 0,
              widget: {
                name: "map",
                config: {
                  latitude: {
                    label: "Latitude",
                    type: "topic",
                    topic: {
                      name: "/gps",
                      type: "sensor_msgs/msg/NavSatFix"
                    },
                    topicField: ".latitude"
                  },
                  longitude: {
                    label: "Longitude",
                    type: "topic",
                    topic: {
                      name: "/gps",
                      type: "sensor_msgs/msg/NavSatFix"
                    },
                    topicField: ".longitude"
                  },
                  gpsStatus: {
                    label: "GPS Status",
                    type: "topic",
                    topic: {
                      name: "/gps",
                      type: "sensor_msgs/msg/NavSatFix"
                    },
                    topicField: ".status.status"
                  }
                }
              }
            },
            hud: {
              label: "HUD",
              width: 4,
              height: 4,
              x: 0,
              y: 0,
              widget: {
                name: "hud",
                config: {
                  speed: {
                    label: "Speed (m/s)",
                    type: "topic",
                    topic: {
                      name: "/speed",
                      type: "std_msgs/msg/Float64"
                    },
                    topicField: ".data"
                  },
                  acceleration: {
                    label: "Acceleration (m/s^2)",
                    type: "topic",
                    topic: {
                      name: "/accel",
                      type: "std_msgs/msg/Float64"
                    },
                    topicField: ".data"
                  }
                }
              }
            },
            hud1: {
              label: "HUD",
              width: 4,
              height: 4,
              x: 0,
              y: 4,
              widget: {
                name: "gauge",
                config: {
                  speed: {
                    label: "Speed (m/s)",
                    type: "topic",
                    topic: {
                      name: "/speed",
                      type: "std_msgs/msg/Float64"
                    },
                    topicField: ".data"
                  },
                  acceleration: {
                    label: "Acceleration (m/s^2)",
                    type: "topic",
                    topic: {
                      name: "/accel",
                      type: "std_msgs/msg/Float64"
                    },
                    topicField: ".data"
                  },
                  gpsStatus: {
                    label: "GPS Status",
                    type: "topic",
                    topic: {
                      name: "/gps",
                      type: "sensor_msgs/msg/NavSatFix"
                    },
                    topicField: ".status.status"
                  }
                }
              }
            },
          }
        }
      },
    }
  }
};
