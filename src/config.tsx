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
              width: 13,
              height: 20,
              x: 0,
              y: 0,
              widget: {
                name: "map",
                config: {
                  latitude: {
                    label: "Latitude",
                    type: "topic",
                    topic: {
                      name: "/gps",
                      type: "custom_msgs/msg/GPS"
                    },
                    topicField: ".latitude"
                  },
                  longitude: {
                    label: "Longitude",
                    type: "topic",
                    topic: {
                      name: "/gps",
                      type: "custom_msgs/msg/GPS"
                    },
                    topicField: ".longitude"
                  },
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
          }
        }
      }
    }
  }
};
