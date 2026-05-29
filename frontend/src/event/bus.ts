import mitt from "mitt";

type Events = {
  "auth:expired": void;
};

export const bus = mitt<Events>();
