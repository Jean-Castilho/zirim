import { ObjectId } from "mongodb";
import UserService from "../services/UserService.js";

import {
    GeneralError,
    UnauthorizedError,
    ValidationError,
    NotFoundError
} from "../utils/handleResponse.js";

import { createToken } from "../services/authServices.js";
import { verifyOtpCode } from "../services/otpService.js";
import { sendPasswordResetEmail } from "../services/contactService.js";

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
        const { email, password, rememberMe } = req.body;
        const rememberUser = rememberMe === 'on' ? true : false;
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
            const result = await this.service.deleteUser(id);
            if (!result) throw new NotFoundError("Usuario nao encontrado.");
            if (req.headers["hx-request"]) {
                return res.status(200).send("");
            }
            return res.status(200).json({ message: "Usuario excluido com sucesso."});
        } catch (error) {
            next(error);
        }
    }

    async updateUser(req, res, next) {
        try {
            const { id } = req.params;
            const { name, phone, role, isActive } = req.body;

            if (!id || !ObjectId.isValid(id)) {
                throw new ValidationError("ID de usuário inválido.");
            }

            if (!name || !name.trim()) {
                throw new ValidationError("O nome é obrigatório.");
            }

            const allowedRoles = ["user", "entregador", "admin"];
            if (role && !allowedRoles.includes(role)) {
                throw new ValidationError("Perfil/função inválida.");
            }

            const updatedUser = await this.service.updateUser(id, {
                name: name.trim(),
                phone: typeof phone === "string" ? phone.trim() : "",
                role: role || "user",
                isActive: typeof isActive === "boolean" ? isActive : isActive === "true"
            });

            if (!updatedUser) {
                throw new NotFoundError("Usuário não encontrado.");
            }

            return res.status(200).json({
                message: "Usuário atualizado com sucesso.",
                user: updatedUser
            });
        } catch (error) {
            next(error);
        }
    }

    async forgotPassword(req, res, next) {
        try {
            const email = String(req.body.email || "").trim().toLowerCase();
            if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
                throw new ValidationError("Informe um endereço de e-mail válido.");
            }

            const token = await this.service.createPasswordResetToken(email);
            if (token) {
                void (async () => {
                    try {
                        const appUrl = process.env.APP_URL || (process.env.NODE_ENV === "production"
                            ? null
                            : `http://localhost:${process.env.PORT || 3090}`);
                        if (!appUrl) throw new Error("APP_URL deve estar configurado em produção.");

                        const resetUrl = new URL("/reset-password", appUrl);
                        resetUrl.searchParams.set("token", token);
                        await sendPasswordResetEmail(email, resetUrl.toString());
                    } catch (emailError) {
                        console.error("Falha ao enviar e-mail de redefinição de senha:", emailError);
                    }
                })();
            }

            return res.status(200).json({
                message: "Se o e-mail informado estiver cadastrado, você receberá um link de redefinição em breve.",
            });
        } catch (error) {
            next(error);
        }
    }

    async PasswordReset(req, res, next) {
        try {
            const { token, password, confirmPassword } = req.body;
            if (!token || !password || !confirmPassword) {
                throw new ValidationError("Preencha todos os campos.");
            }
            if (password !== confirmPassword) {
                throw new ValidationError("As senhas informadas não coincidem.");
            }
            if (!/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/.test(password)) {
                throw new ValidationError("A senha precisa ter no mínimo 8 caracteres, com letra maiúscula, minúscula e número.");
            }

            const updated = await this.service.resetPassword(token, password);
            if (!updated) {
                throw new ValidationError("Este link é inválido ou expirou. Solicite uma nova redefinição.");
            }

            return res.status(200).json({ message: "Senha redefinida com sucesso.", redirect: "/login" });
        } catch (error) {
            next(error);
        }
    }
}