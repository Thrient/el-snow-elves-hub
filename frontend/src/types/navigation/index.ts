export interface RoutePublic {
  id: number;
  path: string;
  title: string;
  icon: string | null;
  parent_id: number | null;
  perm: string | null;
  in_menu: boolean;
  component: string | null;
  children?: RoutePublic[];
}
