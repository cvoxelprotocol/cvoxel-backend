export type UserConnection = {
  address: string;
  dework: DeworkUser;
};

export type DeworkUser = {
  id: string;
  name: string;
  address: string;
};

// export type DeworkTask = {};

export type ThreePid = {
  source: string;
  address: string;
};
