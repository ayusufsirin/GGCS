import { Entity, Topic, Widget } from "./interfaces";
import { SENSOR_SUITE_RECORDING_REQUESTS } from "./application/recording-actions";

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

const arnavINSTopic: Topic = { name: "/ArdicLabs/Arnav/Gnss_Ins_data", type: "ardiclabs_arnav_msgs/msg/Ins" };
const speedTopic: Topic = { name: "/speed", type: "std_msgs/msg/Float64" };
const accelTopic: Topic = { name: "/accel", type: "std_msgs/msg/Float64" };
const zedRgbTopic: Topic = {
  name: "/zed/zed_node/rgb/color/rect/image/compressed",
  type: "sensor_msgs/msg/CompressedImage"
};
const zedDepthTopic: Topic = {
  name: "/zed/zed_node/depth/depth_registered/compressedDepth",
  type: "sensor_msgs/msg/CompressedImage"
};

const quatToRPY = (qx: number, qy: number, qz: number, qw: number) => {
  // roll (x-axis rotation)
  const sinr_cosp = 2 * (qw * qx + qy * qz);
  const cosr_cosp = 1 - 2 * (qx * qx + qy * qy);
  const roll = Math.atan2(sinr_cosp, cosr_cosp);

  // pitch (y-axis rotation)
  const sinp = 2 * (qw * qy - qz * qx);
  const pitch = Math.abs(sinp) >= 1 ? Math.sign(sinp) * (Math.PI / 2) : Math.asin(sinp);

  // yaw (z-axis rotation)
  const siny_cosp = 2 * (qw * qz + qx * qy);
  const cosy_cosp = 1 - 2 * (qy * qy + qz * qz);
  const yaw = Math.atan2(siny_cosp, cosy_cosp);

  return { roll, pitch, yaw };
};

const rad2deg = (r: number) => r * 180 / Math.PI;

const imuWrapper = (msg: any) => {
  // adapt these field names to your message
  const { roll, pitch, yaw } = quatToRPY(msg.orientation.x, msg.orientation.y, msg.orientation.z, msg.orientation.w);
  return {
    roll_rad: roll, pitch_rad: pitch, yaw_rad: yaw,
    roll_deg: rad2deg(roll), pitch_deg: rad2deg(pitch), yaw_deg: rad2deg(yaw),
  };
};

const odomWrapper = (msg: any) => {
  // adapt these field names to your message
  const { roll, pitch, yaw } = quatToRPY(
    msg.pose.pose.orientation.x,
    msg.pose.pose.orientation.y,
    msg.pose.pose.orientation.z,
    msg.pose.pose.orientation.w
  );
  return {
    roll_rad: roll, pitch_rad: pitch, yaw_rad: yaw,
    roll_deg: rad2deg(roll), pitch_deg: rad2deg(pitch), yaw_deg: rad2deg(yaw),
  };
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
                  },
                  actions: {
                    label: "Actions",
                    grids: {
                      horizontal: 2,
                      vertical: 2,
                      items: {
                        zedStartSvo: {
                          label: "Start SVO",
                          width: 1,
                          height: 1,
                          x: 0,
                          y: 0,
                          widget: {
                            name: "service",
                            props: {
                              buttonLabel: "Start SVO",
                              buttonPendingLabel: "Starting",
                              requestParams: SENSOR_SUITE_RECORDING_REQUESTS.zedStart
                            },
                            config: {
                              callService: {
                                type: "service",
                                service: {
                                  name: "/zed/zed_node/start_svo_rec",
                                  type: "zed_msgs/srv/StartSvoRec",
                                }
                              }
                            }
                          }
                        },
                        zedStopSvo: {
                          label: "Stop SVO",
                          width: 1,
                          height: 1,
                          x: 1,
                          y: 0,
                          widget: {
                            name: "service",
                            props: {
                              buttonLabel: "Stop SVO",
                              buttonPendingLabel: "Stopping",
                              requestParams: SENSOR_SUITE_RECORDING_REQUESTS.zedStop
                            },
                            config: {
                              callService: {
                                type: "service",
                                service: {
                                  name: "/zed/zed_node/stop_svo_rec",
                                  type: "std_srvs/srv/Trigger",
                                }
                              }
                            }
                          }
                        },
                        bagStartRecord: {
                          label: "Start ROS Bag",
                          width: 1,
                          height: 1,
                          x: 0,
                          y: 1,
                          widget: {
                            name: "service",
                            props: {
                              buttonLabel: "Start ROS Bag",
                              buttonPendingLabel: "Starting",
                              requestParams: SENSOR_SUITE_RECORDING_REQUESTS.bagStart
                            },
                            config: {
                              callService: {
                                type: "service",
                                service: {
                                  name: "/bag_recorder/start_bag_recording",
                                  type: "std_srvs/srv/Trigger",
                                }
                              }
                            }
                          }
                        },
                        bagStopRecord: {
                          label: "Stop ROS Bag",
                          width: 1,
                          height: 1,
                          x: 1,
                          y: 1,
                          widget: {
                            name: "service",
                            props: {
                              buttonLabel: "Stop ROS Bag",
                              buttonPendingLabel: "Stopping",
                              requestParams: SENSOR_SUITE_RECORDING_REQUESTS.bagStop
                            },
                            config: {
                              callService: {
                                type: "service",
                                service: {
                                  name: "/bag_recorder/stop_bag_recording",
                                  type: "std_srvs/srv/Trigger",
                                }
                              }
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      },
      images: {
        label: "Images",
        grids: {
          horizontal: 3,
          vertical: 2,
          items: {
            zedRgb: {
              label: "ZED RGB",
              height: 1,
              width: 1,
              x: 0,
              y: 0,
              widget: {
                name: "image",
                props: {
                  label: "ZED RGB Image",
                },
                config: {
                  image: {
                    type: "subscriber",
                    topic: zedRgbTopic,
                    topicField: ".data",
                  }
                }
              }
            },
            // zedDepth: {
            //   label: "ZED Depth",
            //   height: 1,
            //   width: 1,
            //   x: 1,
            //   y: 0,
            //   widget: {
            //     name: "image",
            //     props: {
            //       label: "ZED Depth Image",
            //     },
            //     config: {
            //       image: {
            //         type: "subscriber",
            //         topic: zedDepthTopic,
            //         topicField: ".data",
            //       }
            //     }
            //   }
            // },
          }
        }
      },
      // diagnostics: {
      //   label: "Diagnostics",
      //   grids: {
      //     horizontal: 2,
      //     vertical: 1,
      //     items: {
      //       rtkLowRate: {
      //         label: "RTK Low Rate",
      //         height: 1,
      //         width: 1,
      //         x: 0,
      //         y: 0,
      //         widget: {
      //           name: "diagnostics",
      //           props: {
      //             names: ["arnav_serial: Low Rate Messages"] // columns by DiagnosticStatus.name
      //           },
      //           config: {
      //             diagnostics: {
      //               type: "subscriber",
      //               topic: diagnosticsTopic,
      //             }
      //           }
      //         }
      //       },
      //       rtkStatus: {
      //         label: "RTK Status",
      //         height: 1,
      //         width: 1,
      //         x: 1,
      //         y: 0,
      //         widget: {
      //           name: "diagnostics",
      //           props: {
      //             names: ["arnav_serial: Status"] // columns by DiagnosticStatus.name
      //           },
      //           config: {
      //             diagnostics: {
      //               type: "subscriber",
      //               topic: diagnosticsTopic,
      //             }
      //           }
      //         }
      //       }
      //     }
      //   }
      // },
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
