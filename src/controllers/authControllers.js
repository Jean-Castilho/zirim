import UserService from "../services/userService.js";
import { verifyCode } from "../services/otpService.js"; // Import verifyCode
import { GeneralError } from "../errors/customErrors.js"; // Import GeneralError

export const PostLogin = async (req, res, next) => {
    const { email, password } = req.body;

    const userService = new UserService();
    const cookieSecure = process.env.NODE_ENV === 'production';
    const cookieSameSite = process.env.NODE_ENV === 'production' ? 'Lax' : 'Lax';

    try {
        const dataLogin = await userService.login(req, res);

        console.log('Session user:', req.session.user);

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

export const PostRegister = async (req, res, next) => {
    const userService = new UserService();
    const cookieSecure = process.env.NODE_ENV === 'production';
    const cookieSameSite = process.env.NODE_ENV === 'production' ? 'Lax' : 'Lax';

    try {
        const dataRegister = await userService.creatUser(req, res);

        console.log('Registration successful, session ID:', req.sessionID);
        console.log('Session user:', req.session.user);

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

// Novo controlador para verificação de OTP
export const PostVerifyOtp = async (req, res, next) => {
    const { email, otp } = req.body;
    console.log(req.body);

    const userService = new UserService();

    try {
        const user = await userService.getUserById(req.session.user._id);

        if (!user) {
            throw new GeneralError("Usuário não encontrado.", 404);
        }

        const otpEntry = await verifyCode(email, otp);

        if (!otpEntry) {
            throw new GeneralError("Código OTP inválido ou expirado.", 400);
        }



        // Atualizar o status de e-mail verificado na sessão do usuário
        if (req.session.user && req.session.user._id === user._id.toString()) {
            req.session.user = user;
            req.session.user.email.verified = true;

            await req.session.save();
        }



        return res.status(200).json({ message: "Email verificado com sucesso!", redirect: "/profile" });

    } catch (error) {
        next(error);
    }
};