import { verifyOtpCode } from "../services/otpService.js";
import { GeneralError, renderPage } from "../utils/handleResponse.js";

import UserService from "../services/userService.js";
const userService = new UserService();

export const Login = async (req, res, next) => {
    const cookieSecure = process.env.NODE_ENV === 'production';
    const cookieSameSite = process.env.NODE_ENV === 'production' ? 'Lax' : 'Lax';

    try {
        const dataLogin = await userService.login(req, res);

        req.session.save((err) => {
            if (err) {
                console.error('Error saving session after login:', err);
                return next(err);
            }

            return res
                .cookie("token", dataLogin.token, {
                    httpOnly: true,
                    secure: cookieSecure,
                    sameSite: cookieSameSite,
                })
                .status(200)
                .json({ message: "Login realizado", user: dataLogin.user });
        });

    } catch (error) {
        next(error);
    }
};

export const Register = async (req, res, next) => {
    
    const cookieSecure = process.env.NODE_ENV === 'production';
    const cookieSameSite = process.env.NODE_ENV === 'production' ? 'Lax' : 'Lax';

    try {
        const dataRegister = await userService.createUser(req, res);

        console.log('Registration successful, session ID:', req.sessionID);

        req.session.save((err) => {
            if (err) {
                console.error('Error saving session after registration:', err);
                return next(err);
            }

            return res
                .cookie("token", dataRegister.token, {
                    httpOnly: true,
                    secure: cookieSecure,
                    sameSite: cookieSameSite,
                })
                .status(201)
                .json({ message: "Usuário registrado com sucesso", user: dataRegister.user });
        });

    } catch (error) {
        next(error);
    }
};

export const VerifyOtp = async (req, res, next) => {
    const { email, otp } = req.body;

    try {
        const user = await userService.getUserById(req.session.user._id);
        if (!user) {
            throw new GeneralError("Usuário da sessão não encontrado.", 404);
        }
        const otpEntry = await verifyOtpCode(email, otp);
        if (!otpEntry) {
            throw new GeneralError("Código OTP inválido ou expirado.", 400);
        }
        // Persiste a verificação no banco de dados
        const updatedUser = await userService.updateUser(user._id, { emailVerified: true });

        // Atualiza a sessão com os dados mais recentes do usuário
        req.session.user = {
            ...updatedUser,
            _id: updatedUser._id.toString()
        };
        await req.session.save();

        return res.status(200).json({ message: "Email verificado com sucesso!", redirect: "/" });
    } catch (error) {
        next(error);
    }
};