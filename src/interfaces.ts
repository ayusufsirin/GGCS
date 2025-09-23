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

export const ValueTypes = {
  subscriber: "subscriber",
  service: "service",
  constant: "constant",
  publisher: "publisher",
} as const;

// Discriminated union for config values
export interface SubscriberValue {
  type: typeof ValueTypes.subscriber;
  topic: Topic;
  topicField: string;
}

export interface ServiceValue {
  type: typeof ValueTypes.service;
  service: Service;
}

export interface ConstantValue {
  type: typeof ValueTypes.constant;
  constant: unknown;
}

export interface PublisherValue {
  type: typeof ValueTypes.publisher;
  topic: Topic;
  topicField?: string;
}

export type Value = SubscriberValue | ServiceValue | ConstantValue | PublisherValue;

export interface Widget {
  name: string;
  props?: Record<string, any>;
  config: Record<string, Value>;
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
