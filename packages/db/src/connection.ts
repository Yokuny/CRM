import mongoose from 'mongoose';

export const connect = async (uri: string): Promise<void> => {
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });
};

export const disconnect = async (): Promise<void> => {
  await mongoose.disconnect();
};
