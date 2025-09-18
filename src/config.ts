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

const targetSpeedTopic: Topic = {
  name: "/target_speed",
  type: "std_msgs/msg/Float64"
}

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
      type: "subscriber",
      topic: rollTopic,
      topicField: ".data"
    },
    pitch: {
      type: "subscriber",
      topic: pitchTopic,
      topicField: ".data"
    },
    heading: {
      type: "subscriber",
      topic: headingTopic,
      topicField: ".data"
    },
    speed: {
      type: "subscriber",
      topic: speedTopic,
      topicField: ".data"
    },
    altitude: {
      type: "subscriber",
      topic: altitudeTopic,
      topicField: ".data"
    }
  }
};

const mapWidget: Widget = {
  name: "map",
  props: {
    initialZoom: 10
  },
  config: {
    latitude: {
      type: "subscriber",
      topic: gpsTopic,
      topicField: ".latitude"
    },
    longitude: {
      type: "subscriber",
      topic: gpsTopic,
      topicField: ".longitude"
    },
    heading: {
      type: "subscriber",
      topic: headingTopic,
      topicField: ".data"
    }
  }
};

const speedGaugeWidget: Widget = {
  name: "gauge",
  config: {
    value: {
      type: "subscriber",
      topic: speedTopic,
      topicField: ".data"
    },
    label: {
      type: "constant",
      constant: "Speed (m/s)",
    }
  }
};

const accelGaugeWidget: Widget = {
  name: "gauge",
  config: {
    value: {
      type: "subscriber",
      topic: accelTopic,
      topicField: ".data"
    },
    label: {
      type: "constant",
      constant: "Acceleration (m/s^2)",
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
                      props:{
                        speedLabel: "Sample Speed (m/s)",
                      },
                      name: "sample", config: {
                        speed: {
                          type: "subscriber",
                          topic: speedTopic,
                          topicField: ".data"
                        },
                        speedMultiplier: {
                          type: "constant",
                          constant: 0.1,
                        },
                        reset: {
                          type: "service",
                          service: {name: "/reset", type: "std_srvs/srv/Trigger"}
                        },
                        setSpeed: {
                          type: "publisher",
                          topic: targetSpeedTopic,
                          topicField: ".data"
                        },
                        targetSpeed: {
                          type: "subscriber",
                          topic: targetSpeedTopic,
                          topicField: ".data"
                        }
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
                  gauges: {
                    label: "Gauges",
                    grids: {
                      horizontal: 2,
                      vertical: 2,
                      items: {
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
