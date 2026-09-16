import UserService from "../services/UserService.js";

import {
    GeneralError,
    UnauthorizedError,
    ValidationError,
    NotFoundError
} from "../utils/handleResponse.js";

import { createToken } from "../services/authServices.js";
import { verifyOtpCode } from "../services/otpService.js";

export default class UserController {
    constructor() {
        this.service = new UserService();
    }
    
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
        const { email, password } = req.body;
        try {
            const user = await this.service.authenticate(email, password);
            await this.#establishSession(req, res, next, user, 200, "Login realizado");
        } catch (error) {
            next(error);
        }
    }

    async register(req, res, next) {
        try {
            const createdUser = await this.service.registerUser(req.body);
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
            
            const user = await this.service.verifyAndUpgradeUser(req.session.user._id);
           
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
            const result = await this.service.repository.delete(id); // Repository ainda acessível via service se necessário
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