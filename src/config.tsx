import { Entity, Topic, Widget } from "./interfaces";

const rollTopic: Topic = {
  name: "/roll",
  type: "std_msgs/msg/Float64"
};

const pitchTopic: Topic = {
  name: "/pitch",
  type: "std_msgs/msg/Float64"
};

const headingTopic: Topic = {
  name: "/heading",
  type: "std_msgs/msg/Float64"
};

const speedTopic: Topic = {
  name: "/speed",
  type: "std_msgs/msg/Float64"
};

const altitudeTopic: Topic = {
  name: "/altitude",
  type: "std_msgs/msg/Float64"
};

const accelTopic: Topic = {
  name: "/accel",
  type: "std_msgs/msg/Float64"
};

const gpsTopic: Topic = {
  name: "/gps",
  type: "sensor_msgs/msg/NavSatFix"
};

const hudWidget: Widget = {
  name: "hud",
  config: {
    roll: {
      label: "Speed (m/s)",
      type: "topic",
      topic: rollTopic,
      topicField: ".data"
    },
    pitch: {
      label: "Speed (m/s)",
      type: "topic",
      topic: pitchTopic,
      topicField: ".data"
    },
    heading: {
      label: "Speed (m/s)",
      type: "topic",
      topic: headingTopic,
      topicField: ".data"
    },
    speed: {
      label: "Speed (m/s)",
      type: "topic",
      topic: speedTopic,
      topicField: ".data"
    },
    altitude: {
      label: "Speed (m/s)",
      type: "topic",
      topic: altitudeTopic,
      topicField: ".data"
    }
  }
};

const mapWidget: Widget = {
  name: "map",
  config: {
    latitude: {
      label: "Latitude",
      type: "topic",
      topic: gpsTopic,
      topicField: ".latitude"
    },
    longitude: {
      label: "Longitude",
      type: "topic",
      topic: gpsTopic,
      topicField: ".longitude"
    },
    gpsStatus: {
      label: "GPS Status",
      type: "topic",
      topic: gpsTopic,
      topicField: ".status.status"
    }
  }
};

const gaugeWidget: Widget = {
  name: "gauge",
  config: {
    speed: {
      label: "Speed (m/s)",
      type: "topic",
      topic: speedTopic,
      topicField: ".data"
    },
    acceleration: {
      label: "Acceleration (m/s^2)",
      type: "topic",
      topic: accelTopic,
      topicField: ".data"
    },
    gpsStatus: {
      label: "GPS Status",
      type: "topic",
      topic: gpsTopic,
      topicField: ".status.status"
    }
  }
};

export const config: Entity = {
  tabs: {
    items: {
      home: {
        label: "Home",
        grids: {
          horizontal: 12,
          vertical: 12,
          items: {
            map: {
              label: "Map",
              width: 8,
              height: 12,
              x: 4,
              y: 0,
              widget: mapWidget
            },
            hud: {
              label: "HUD",
              width: 4,
              height: 4,
              x: 0,
              y: 0,
              widget: hudWidget
            },
            gauge: {
              label: "Gauge",
              width: 4,
              height: 4,
              x: 0,
              y: 4,
              widget: gaugeWidget
            },
            panel: {
              label: "Panel",
              width: 4,
              height: 4,
              x: 0,
              y: 8,
              tabs: {
                items: {
                  actions: {
                    label: "Actions",
                    widget: mapWidget
                  },
                  healthCheck: {
                    label: "Health Check",
                    widget: gaugeWidget
                  },
                }
              }
            }
          }
        }
      },
      settings: {
        label: "Settings",
        widget: { name: "settings", config: {} }
      },
    }
  }
};
