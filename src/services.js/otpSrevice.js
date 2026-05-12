import { getDataBase } from "../config/db.js";

export const generateOTP = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

export const armazenCodeOtp = async (params, code) => {
  await getDataBase().collection("otps-code").insertOne({ params, code });
};

export const verifyCode = async (params, code) => {
  const otps = await getDataBase()
    .collection("otps-code")
    .find({ params })
    .toArray();

  return otps.find((otp) => otp.code === String(code)) || null;
};