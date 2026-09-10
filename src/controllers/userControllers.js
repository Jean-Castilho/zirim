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
    compararPassword
} from "../services/authServices.js";
import { validateUser } from "../services/validationData.js";
import { verifyOtpCode } from "../services/otpService.js";

export default class UserController extends UserRepository {
    
    async #establishSession(req, res, next, user, statusCode, message) {
        const cookieSecure = process.env.NODE_ENV === 'production';
        const token = createToken({
            _id: user._id,
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
                .status(statusCode)
                .json({ message, user });
        });
    }

    async login(req, res, next) {
        const { email, password, rememberMe } = req.body;
        const rememberUser = rememberMe === 'on' ? true : false;
        try {
            const user = await this.findByEmailForAuth(email);
            
            if (!user) {
                throw new ValidationError("Usuario nao encontrado.");
            }
            const ismatch = await compararPassword(password, user.password);
            if (!ismatch) {
                throw new ValidationError("Email ou senha incorretos.");
            }

            await this.#establishSession(req, res, next, user, 200, "Login realizado");
        } catch (error) {
            next(error);
        }
    }

    async register(req, res, next) {
        try {
            const validation = validateUser(req.body);
            const dataUser = validation.data;

            console.log(dataUser);
            console.log(validation);

            if (!validation.isValid) {
                throw new ValidationError(
                    validation.errors[0].message,
                    validation.errors
                );
            }

            // Verificação granular de existência
            const emailExists = await this.findByEmail(dataUser.email);
            if (emailExists) {
                throw new GeneralError("Este e-mail já está sendo utilizado.", 409);
            }

            const phoneExists = await this.findByPhone(dataUser.phone);
            if (phoneExists) {
                throw new GeneralError("Este número de telefone já está sendo utilizado.", 409);
            }

            dataUser.password = await createHashPassword(dataUser.password);

            const createdUser = await this.create(dataUser);

            await this.#establishSession(req, res, next, createdUser, 201, "Usuario registrado com sucesso");
        } catch (error) {
            next(error);
        }
    }

    async verifyOtp(req, res, next) {

        const { email, otp } = req.body;
        
        try {
            if (!req.session?.user?._id) {
                throw new UnauthorizedError("Sessao expirada ou usuario nao autenticado.");
            }
            const otpEntry = await verifyOtpCode(email, otp);
            if (!otpEntry) {
                throw new GeneralError("Codigo OTP invalido ou expirado.", 400);
            }
            const updatedUser = await this.updateProfile(req.session.user._id, { emailVerified: true });
            if (!updatedUser) {
                throw new NotFoundError("Usuario nao encontrado para atualizacao.");
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
            if (!result) throw new NotFoundError("Usuario nao encontrado.");
            return res.status(200).json({ message: "Usuario excluido com sucesso."});
        } catch (error) {
            next(error);
        }
    }

    async forgotPassword(req, res, next) {
        
        try {

            const email = req.body.email?.trim();

            if (!email) {
                throw new ValidationError("O e-mail é obrigatório para recuperar a senha.");
            }

            // Logica de negócio: aqui você chamaria o service para enviar o e-mail;
            // Ex: await authService.requestPasswordReset(email);
            
            // Retorna um fragmento HTML para o HTMX injetar no #feedback-msg;
            return res.status(200).send(`
                <div class="p-3 mb-4 text-sm text-green-400 bg-green-950/30 rounded-xl border border-green-800/50">
                    Se o e-mail <strong>${email}</strong> estiver em nossa base, você receberá um link em breve.
                </div>
            `);
        
        } catch (error) {
        
            next(error);
        
        }

    }
}