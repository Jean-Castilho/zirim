import UserService from "../services.js/userService.js";

export const PostLogin = async (req, res, next) => {
    const { email, password } = req.body;

    const userService = new UserService();
    const cookieSecure = process.env.NODE_ENV === 'production';
    const cookieSameSite = process.env.NODE_ENV === 'production' ? 'Lax' : 'Lax';

    try {
        const dataLogin = await userService.login(req, res);

        console.log('Login successful, session ID:', req.sessionID);
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