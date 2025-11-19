import { Entity, Topic, Widget } from "./interfaces";

import {
  Bubbles,
  LocateFixed,
  Magnet,
  MapPinCheckInside,
  Power,
  Rotate3D,
  Satellite,
  ShipWheel
} from "lucide-react";

const arnavINSTopic: Topic = {
  name: "/ArdicLabs/Arnav/Gnss_Ins_data",
  type: "ardiclabs_arnav_msgs/msg/Ins"
}

const speedTopic: Topic = {
  name: "/speed",
  type: "std_msgs/msg/Float64"
};

const accelTopic: Topic = {
  name: "/accel",
  type: "std_msgs/msg/Float64"
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
          horizontal: 24,
          vertical: 12,
          items: {
            map: {
              label: "Map",
              width: 16,
              height: 12,
              x: 8,
              y: 0,
              widget: mapWidget
            },
            hud: {
              label: "HUD",
              width: 8,
              height: 4,
              x: 0,
              y: 0,
              widget: hudWidget
            },
            gpsStatus: {
              label: "GPS Status",
              width: 1,
              height: 1,
              x: 7,
              y: 4,
              widget: {
                name: "status",
                props: {
                  // label: "GPS Satellites",
                  kind: "number",
                  valueAttr: "gpsSatellites",
                  icon: Satellite,
                  unit: "sat",
                  decimals: 0,
                  thresholds: [
                    { min: 0, color: "#D14343" },
                    { min: 4, color: "#E3A008" },
                    { min: 8, color: "#0E9F6E" },
                  ],
                  hint: "Locked satellites",
                  dense: true,
                  iconSize: 40
                },
                config: {
                  gpsSatellites: {
                    type: "subscriber",
                    topic: {
                      name: "/arnav/satellites", type: "std_msgs/msg/Int64"
                    },
                    topicField: ".data"
                  },
                }
              }
            },
            rtkSystemStatus: {
              label: "RTK System Status",
              width: 1,
              height: 1,
              x: 0,
              y: 4,
              widget: {
                name: "status",
                props: {
                  // label: "Relay",
                  kind: "boolean",
                  valueAttr: "status",
                  icon: Power,
                  onText: "OK",
                  offText: "ERR",
                  onColor: "#0E9F6E",
                  offColor: "#D14343",
                  hint: "System OK",
                  dense: true,
                },
                config: {
                  status: {
                    type: "subscriber",
                    topic: arnavINSTopic,
                    topicField: ".status.system_ok", // boolean
                  }
                }
              }
            },
            rtkRollPitchStatus: {
              label: "RTK Roll Pitch Status",
              width: 1,
              height: 1,
              x: 1,
              y: 4,
              widget: {
                name: "status",
                props: {
                  // label: "Relay",
                  kind: "boolean",
                  valueAttr: "status",
                  icon: Rotate3D,
                  onText: "OK",
                  offText: "ERR",
                  onColor: "#0E9F6E",
                  offColor: "#D14343",
                  hint: "Roll/Pitch OK",
                  dense: true,
                },
                config: {
                  status: {
                    type: "subscriber",
                    topic: arnavINSTopic,
                    topicField: ".status.roll_pitch_ok", // boolean
                  }
                }
              }
            },
            rtkYawStatus: {
              label: "RTK Yaw Status",
              width: 1,
              height: 1,
              x: 2,
              y: 4,
              widget: {
                name: "status",
                props: {
                  // label: "Relay",
                  kind: "boolean",
                  valueAttr: "status",
                  icon: ShipWheel,
                  onText: "OK",
                  offText: "ERR",
                  onColor: "#0E9F6E",
                  offColor: "#D14343",
                  hint: "Yaw OK",
                  dense: true,
                },
                config: {
                  status: {
                    type: "subscriber",
                    topic: arnavINSTopic,
                    topicField: ".status.yaw_ok", // boolean
                  }
                }
              }
            },
            rtkPosVelStatus: {
              label: "RTK Pos/Vel Status",
              width: 1,
              height: 1,
              x: 3,
              y: 4,
              widget: {
                name: "status",
                props: {
                  // label: "Relay",
                  kind: "boolean",
                  valueAttr: "status",
                  icon: MapPinCheckInside,
                  onText: "OK",
                  offText: "ERR",
                  onColor: "#0E9F6E",
                  offColor: "#D14343",
                  hint: "Pos/Vel OK",
                  dense: true,
                },
                config: {
                  status: {
                    type: "subscriber",
                    topic: arnavINSTopic,
                    topicField: ".status.pos_vel_ok", // boolean
                  }
                }
              }
            },
            rtkMagStatus: {
              label: "RTK Magnetometer Status",
              width: 1,
              height: 1,
              x: 4,
              y: 4,
              widget: {
                name: "status",
                props: {
                  // label: "Relay",
                  kind: "boolean",
                  valueAttr: "status",
                  icon: Magnet,
                  onText: "OK",
                  offText: "ERR",
                  onColor: "#0E9F6E",
                  offColor: "#D14343",
                  hint: "Mag OK",
                  dense: true,
                },
                config: {
                  status: {
                    type: "subscriber",
                    topic: arnavINSTopic,
                    topicField: ".status.mag_ok", // boolean
                  }
                }
              }
            },
            rtkGnssStatus: {
              label: "RTK GNSS Status",
              width: 1,
              height: 1,
              x: 5,
              y: 4,
              widget: {
                name: "status",
                props: {
                  // label: "Relay",
                  kind: "boolean",
                  valueAttr: "status",
                  icon: LocateFixed,
                  onText: "Fixed",
                  offText: "No Fix",
                  onColor: "#0E9F6E",
                  offColor: "#D14343",
                  hint: "GNSS Fixed",
                  dense: true,
                },
                config: {
                  status: {
                    type: "subscriber",
                    topic: arnavINSTopic,
                    topicField: ".status.gnss_fixed", // boolean
                  }
                }
              }
            },
            rtkRtkStatus: {
              label: "RTK Float/Fixed Status",
              width: 1,
              height: 1,
              x: 6,
              y: 4,
              widget: {
                name: "status",
                props: {
                  // label: "Relay",
                  kind: "boolean",
                  valueAttr: "status",
                  icon: Bubbles,
                  onText: "Fixed",
                  offText: "Floating",
                  onColor: "#0E9F6E",
                  offColor: "#D14343",
                  hint: "RTK Fixed",
                  dense: true,
                },
                config: {
                  status: {
                    type: "subscriber",
                    topic: arnavINSTopic,
                    topicField: ".status.gnss_fixed", // boolean
                  }
                }
              }
            },
            panel: {
              label: "Panel",
              width: 8,
              height: 7,
              x: 0,
              y: 5,
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
