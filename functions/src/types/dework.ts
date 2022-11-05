export type Task = {
  id: string;
  name: string;
  description: string;
  status: string;
  dueDate?: string;
  createdAt: string;
  doneAt: string;
  deletedAt?: string;
  workspaceId: string;
  workspace: Workspace;
  number: number;
  gating: string;
  openToBids: boolean;
  submissionCount: number;
  applicationCount: number;
  tags: Tag[];
  skills: Skill[];
  assignees: User[];
  owners: User[];
  creator: User;
  rewards: Reward[];
  review?: Review[] | null;
  reactions: Reaction[];
};

export type Review = {
  id: string;
  message: string;
  rating: string;
};

export type Reaction = {
  id: string;
  userId: string;
  reaction: string;
};

export type Reward = {
  id: string;
  amount: string;
  peggedToUsd: boolean;
  fundingSessionId?: any;
  token: Token;
  tokenId: string;
  payments: Payment[];
};

export type Token = {
  id: string;
  exp: number;
  type: string;
  name: string;
  symbol: string;
  address: string;
  identifier?: any;
  usdPrice: number;
  networkId: string;
  visibility: string;
  imageUrl: string;

  network: Network;
};

export type Network = {
  id: string;
  slug: string;
  name: string;
  type: string;
  config: Config;
  sortKey: string;
};

export type Config = {
  chainId: number;
  rpcUrl: string;
  explorerUrl: string;
  gnosisSafe: GnosisSafe;
};

export type GnosisSafe = {
  serviceUrl: string;
  addressPrefix: string;
  safeUrlPrefix: string;
};

export type User = {
  id: string;
  username: string;
  permalink?: string;
};

export type Skill = {
  id: string;
  name: string;
  emoji: string;
};

export type Tag = {
  id: string;
  label: string;
};

export type Workspace = {
  id: string;
  slug: string;
  name: string;
  status: string;
  deletedAt?: any;
  organizationId: string;
  permalink: string;
  organization: DeworkOrganization;
};

export type DeworkOrganization = {
  id: string;
  name: string;
  slug: string;
  tagline: string;
  permalink: string;
  imageUrl?: string;
  description?: string;
};

export type Payment = {
  id: string;
  amount: string;
  payment: PaymentDetail;
  user: User;
};

export type PaymentDetail = {
  id: string;
  status: string;
  paymentMethod: PaymentMethod;
  data: PaymentData;
};

export type PaymentMethod = {
  id: string;
  address: string;
  type: string;
  network: Network;
};

export type PaymentData = {
  txHash: string;
};
