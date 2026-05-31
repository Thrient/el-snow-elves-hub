import mitt from "mitt";

type Events = {
  "auth:expired": void;
  "app:error": string;
};

export const bus = mitt<Events>();
