export interface Entity {
  widget?: Widget;
  tabs?: Tabs;
  grids?: Grids;
}

export interface Topic {
  name: string;
  type: string;
}

export interface Service {
  name: string;
  type: string
}

// TODO: Make fields depend on type
export interface Value {
  type: "topic" | "service" | "constant";
  // topic interface fields
  topic?: Topic;
  topicField?: string;
  // service interface fields
  service?: Service;
  // constant interface fields
  constant?: unknown;
}

export interface Widget {
  name: string;
  config: {
    [id: string]: Value;
  }
}

export interface Tab extends Entity {
  label: string,
}

export interface Tabs {
  items: { [key: string]: Tab };
}

export interface Grid extends Entity {
  label: string,
  width: number;
  height: number;
  x: number;
  y: number;
}

export interface Grids {
  horizontal: number;
  vertical: number;
  items: { [key: string]: Grid };
}
