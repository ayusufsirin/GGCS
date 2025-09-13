export interface Entity {
  widget?: Widget;
  tabs?: Tabs;
  grids?: Grids;
}

export interface Topic {
  name: string;
  type: string;
}

export interface Value {
  label: string;
  type: "topic";
  topic: Topic;
  topicField: string;
}

export interface Widget {
  name: "gauge" | "hud" | "map" | "settings";
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
