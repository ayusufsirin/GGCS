import { Entity, Topic, Widget } from "./interfaces";

const arnavINSTopic: Topic = {
  name: "/ArdicLabs/Arnav/Gnss_Ins_data",
  type: "ardiclabs_arnav_msgs/msg/Ins"
}

const speedTopic: Topic = {
  name: "/speed",
  type: "std_msgs/msg/Float64"
};

const targetSpeedTopic: Topic = {
  name: "/target_speed",
  type: "std_msgs/msg/Float64"
}

const accelTopic: Topic = {
  name: "/accel",
  type: "std_msgs/msg/Float64"
};

const gpsTopic: Topic = {
  name: "/gps",
  type: "sensor_msgs/msg/NavSatFix"
};

const speedTopicWrapper = (msg: unknown) => {
  // msg is the full ROS message; extract and transform
  const data = (msg as any)?.data;
  const newData = (typeof data === "number") ? (data * 180) / Math.PI : data;
  return { data: newData, deg: newData, rad: data };
};

const targetSpeedTopicWrapper = (msg: unknown) => {
  const data = (msg as any)?.data;
  const newData = (typeof data === "number") ? (data * 180) / Math.PI : data;
  return { data: newData, deg: newData, rad: data };
};

const hudWidget: Widget = {
  name: "hud",
  config: {
    roll: {
      type: "subscriber",
      topic: arnavINSTopic,
      topicField: ".roll_deg",
      topicWrapper: (msg: any) => ({ roll_deg: msg.roll_rad * 180 / Math.PI })
    },
    pitch: {
      type: "subscriber",
      topic: arnavINSTopic,
      topicField: ".pitch_deg",
      topicWrapper: (msg: any) => ({ pitch_deg: msg.pitch_rad * 180 / Math.PI })
    },
    heading: {
      type: "subscriber",
      topic: arnavINSTopic,
      topicField: ".yaw_deg",
      topicWrapper: (msg: any) => ({ yaw_deg: msg.yaw_rad * 180 / Math.PI })
    },
    speed: {
      type: "subscriber",
      topic: speedTopic,
      topicField: ".data"
    },
    altitude: {
      type: "subscriber",
      topic: arnavINSTopic,
      topicField: ".h_m"
    }
  }
};

const mapWidget: Widget = {
  name: "map",
  props: {
    initialZoom: 20,
    maxZoom: 24
  },
  config: {
    latitude: {
      type: "subscriber",
      topic: arnavINSTopic,
      topicField: ".lat_deg",
      topicWrapper: (msg: any) => ({ lat_deg: msg.lat_rad * 180 / Math.PI })
    },
    longitude: {
      type: "subscriber",
      topic: arnavINSTopic,
      topicField: ".lon_deg",
      topicWrapper: (msg: any) => ({ lon_deg: msg.lon_rad * 180 / Math.PI })
    },
    heading: {
      type: "subscriber",
      topic: arnavINSTopic,
      topicField: ".yaw_deg",
      topicWrapper: (msg: any) => ({ yaw_deg: msg.yaw_rad * 180 / Math.PI })
    }
  }
};

const speedGaugeWidget: Widget = {
  name: "gauge",
  props: {
    label: "Speed",
    units: "(m/s)",
    min: 0.0,
    max: 10.0,
    decimals: 2,
    warn: 3,
    danger: 7,
    segments: 10,
    needleColor: "#dc3939",
  },
  config: {
    value: {
      type: "subscriber",
      topic: speedTopic,
      topicField: ".data"
    }
  }
};

const accelGaugeWidget: Widget = {
  name: "gauge",
  props: {
    label: "Acceleration",
    units: "(m/s^2)",
  },
  config: {
    value: {
      type: "subscriber",
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
      rosParameters: {
        label: "ROS Parameters",
        widget: {
          name: "rosParameters",
          config: {
            listNodes: {
              type: "service",
              service: { name: "/rosapi/nodes", type: "rosapi/Nodes" }
            },
            getParamNames: {
              type: "service",
              service: { name: "/rosapi/get_param_names", type: "rosapi/GetParamNames" }
            },
            getParam: {
              type: "service",
              service: { name: "/rosapi/get_param", type: "rosapi/GetParam" }
            },
            setParam: {
              type: "service",
              service: { name: "/rosapi/set_param", type: "rosapi/SetParam" }
            }
          }
        }
      }
    }
  }
};
