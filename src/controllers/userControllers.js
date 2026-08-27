import UserRepository from "../repository/UserRepository.js";
import { 
    GeneralError, 
    UnauthorizedError, 
    ValidationError, 
    NotFoundError 
} from "../utils/handleResponse.js";
import { 
    createHashPassword, 
    createToken, 
    comparePassword 
} from "../services/authServices.js";
import { validateUser } from "../services/validationData.js";
import { verifyOtpCode } from "../services/otpService.js";

export default class UserController extends UserRepository {
    
    async login(req, res, next) {
        const cookieSecure = process.env.NODE_ENV === 'production';
        const { email, password } = req.body;

        try {
            const user = await this.findByEmailForAuth(email);

            if (!user) {
                throw new UnauthorizedError("Usuario nao encontrado.");
            }

            const ismatch = await comparePassword(password, user.password);

            if (!ismatch) {
                throw new UnauthorizedError("Email ou senha incorretos.");
            }

            const token = createToken({
                id: user._id,
                email: user.email.endereco,
            });

            req.session.user = {
                ...user,
                _id: user._id.toString()
            };

            req.session.save((err) => {
                if (err) return next(err);

                return res
                    .cookie("token", token, {
                        httpOnly: true,
                        secure: cookieSecure,
                        sameSite: 'Lax',
                    })
                    .status(200)
                    .json({ message: "Login realizado", user });
            });

        } catch (error) {
            next(error);
        }
    }

    async register(req, res, next) {
        const cookieSecure = process.env.NODE_ENV === 'production';

        try {
            const validation = validateUser(req.body);
            const dataUser = validation.data;

            if (!validation.isValid) {
                throw new ValidationError(
                    "Dados inválidos. Por favor, verifique os campos.",
                    validation.errors
                );
            }

            const userExists = await this.verifyExists({
                email: dataUser.email,
                phone: dataUser.phone,
            });

            if (userExists) {
                throw new GeneralError("Usuário já existe.", 409);
            }

            dataUser.password = await createHashPassword(dataUser.password);
            const createdUser = await this.create(dataUser);

            const token = createToken({
                _id: createdUser._id,
                email: createdUser.email.endereco,
            });

            req.session.user = {
                ...createdUser,
                _id: createdUser._id.toString()
            };

            req.session.save((err) => {
                if (err) return next(err);

                return res
                    .cookie("token", token, {
                        httpOnly: true,
                        secure: cookieSecure,
                        sameSite: 'Lax',
                    })
                    .status(201)
                    .json({ message: "Usuário registrado com sucesso", user: createdUser });
            });

        } catch (error) {
            next(error);
        }
    }

    async verifyOtp(req, res, next) {
        const { email, otp } = req.body;

        try {
            if (!req.session?.user?._id) {
                throw new UnauthorizedError("Sessão expirada ou usuário não autenticado.");
            }

            const otpEntry = await verifyOtpCode(email, otp);
            if (!otpEntry) {
                throw new GeneralError("Código OTP inválido ou expirado.", 400);
            }

            const updatedUser = await this.updateProfile(req.session.user._id, { emailVerified: true });

            if (!updatedUser) {
                throw new NotFoundError("Usuário não encontrado para atualização.");
            }

            const user = await this.findById(req.session.user._id);
            req.session.user = {
                ...user,
                _id: user._id.toString()
            };
            await req.session.save();

            return res.status(200).json({ message: "Email verificado com sucesso!", redirect: "/" });
        } catch (error) {
            next(error);
        }
    }

    async deleteUser(req, res, next) {
        try {
            const { id } = req.params;
            const result = await this.delete(id);
            if (!result) throw new NotFoundError("Usuário não encontrado.");
            return res.status(200).json({ message: "Usuário excluído com sucesso." });
        } catch (error) {
            next(error);
        }
    }
}