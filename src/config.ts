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
    heading: {
      label: "Heading",
      type: "topic",
      topic: headingTopic,
      topicField: ".data"
    }
  }
};

const speedGaugeWidget: Widget = {
  name: "gauge",
  config: {
    value: {
      label: "Speed (m/s)",
      type: "topic",
      topic: speedTopic,
      topicField: ".data"
    }
  }
};

const accelGaugeWidget: Widget = {
  name: "gauge",
  config: {
    acceleration: {
      label: "Acceleration (m/s^2)",
      type: "topic",
      topic: accelTopic,
      topicField: ".data"
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
            panel: {
              label: "Panel",
              width: 4,
              height: 8,
              x: 0,
              y: 4,
              tabs: {
                items: {
                  sampleWidget: {
                    label: "Sample Widget",
                    widget: {
                      name: "sample", config: {
                        speed: {
                          label: "Speed (m/s)",
                          type: "topic",
                          topic: speedTopic,
                          topicField: ".data"
                        },
                        reset: {
                          label: "Reset",
                          type: "service",
                          service: {name: "/reset", type: "std_srvs/srv/Trigger"}
                        },
                      }
                    }
                  },
                  actions: {
                    label: "Actions",
                    widget: {name: "action", config: {}}
                  },
                  healthCheck: {
                    label: "Health Check",
                    widget: {name: "action", config: {}}
                  },
                  gauges:{
                    label: "Gauges",
                    grids: {
                      horizontal: 2,
                      vertical: 2,
                      items:{
                        speed: {
                          label: "Speed",
                          width: 1,
                          height: 1,
                          x: 0,
                          y: 0,
                          widget: speedGaugeWidget
                        },
                        accel: {
                          label: "Accel",
                          width: 1,
                          height: 1,
                          x: 1,
                          y: 0,
                          widget: accelGaugeWidget
                        },
                      }
                    }
                  }
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
