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
import { sendEmailOtp as dispatchEmailOtp, sendPasswordResetEmail } from "../services/contactService.js";

export default class UserController {
    constructor() {
        this.service = new UserService();
    }
    
    async #establishSession(req, res, next, user, statusCode, message) {
        try {
            await new Promise((resolve, reject) => {
                req.session.regenerate((error) => error ? reject(error) : resolve());
            });

            const safeUser = { ...user };
            delete safeUser.password;

            const token = createToken({
                _id: safeUser._id,
                email: safeUser.email?.endereco,
            });
            const sessionUser = {
                ...safeUser,
                _id: safeUser._id.toString()
            };
            req.session.user = sessionUser;

            await new Promise((resolve, reject) => {
                req.session.save((error) => error ? reject(error) : resolve());
            });

            return res
                .cookie("token", token, {
                    httpOnly: true,
                    secure: process.env.NODE_ENV === 'production',
                    sameSite: 'Lax',
                })
                .status(statusCode)
                .json({ message, user: sessionUser });
        } catch (error) {
            return next(error);
        }
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

            const accountEmail = String(req.session.user.email?.endereco || "").trim().toLowerCase();
            const requestedEmail = String(email || "").trim().toLowerCase();
            if (!accountEmail || requestedEmail !== accountEmail) {
                throw new ValidationError("O código deve corresponder ao e-mail da sua conta.");
            }

            const otpEntry = await verifyOtpCode(accountEmail, otp);
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

    async sendEmailOtp(req, res, next) {
        try {
            const email = String(req.session?.user?.email?.endereco || "").trim().toLowerCase();
            if (!email) throw new ValidationError("Sua conta não possui um e-mail válido.");

            await dispatchEmailOtp(email);
            return res.status(200).json({ message: "Código de verificação enviado para o e-mail da sua conta." });
        } catch (error) {
            next(error);
        }
    }

    async sendPhoneOtp(req, res, next) {
        try {
            const userId = req.session?.user?._id;
            if (!userId) throw new UnauthorizedError("Usuário não autenticado.");

            const result = await this.service.requestPhoneVerification(userId, req.body.phone);
            if (result.alreadyVerified) {
                req.session.phoneVerificationNumber = null;
                return res.status(200).json({ message: "Este número já está verificado.", verified: true });
            }

            req.session.phoneVerificationNumber = result.phone;
            return res.status(200).json({ message: "Código de verificação enviado pelo WhatsApp." });
        } catch (error) {
            next(error);
        }
    }

    async verifyPhoneOtp(req, res, next) {
        try {
            const userId = req.session?.user?._id;
            if (!userId) throw new UnauthorizedError("Usuário não autenticado.");

            const phone = String(req.body.phone || "").trim();
            if (req.session.phoneVerificationNumber !== phone) {
                throw new ValidationError("Solicite um novo código para este número.");
            }

            const user = await this.service.verifyPhoneNumber(userId, phone, req.body.otp);
            req.session.user.phone = user.phone;
            req.session.phoneVerificationNumber = null;

            return res.status(200).json({ message: "Número de telefone verificado com sucesso." });
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

    async updateProfile(req, res, next) {
        try {
            const userId = req.session?.user?._id;
            if (!userId) throw new UnauthorizedError("Usuário não autenticado.");

            const name = String(req.body.name || "").trim();
            if (!name) throw new ValidationError("O nome é obrigatório.");

            const updatedUser = await this.service.updateUser(userId, { name });
            req.session.user.name = updatedUser.name;
            return res.status(200).json({ message: "Perfil atualizado com sucesso.", user: updatedUser });
        } catch (error) {
            next(error);
        }
    }

    async updatePassword(req, res, next) {
        try {
            const userId = req.session?.user?._id;
            if (!userId) throw new UnauthorizedError("Usuário não autenticado.");

            const { currentPassword, password, confirmPassword } = req.body;
            if (!currentPassword || !password || !confirmPassword) {
                throw new ValidationError("Preencha a senha atual, a nova senha e a confirmação.");
            }
            if (password !== confirmPassword) {
                throw new ValidationError("As senhas informadas não coincidem.");
            }
            if (!/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/.test(password)) {
                throw new ValidationError("A senha precisa ter no mínimo 8 caracteres, com letra maiúscula, minúscula e número.");
            }

            await this.service.changePassword(userId, currentPassword, password);
            return res.status(200).json({ message: "Senha atualizada com sucesso." });
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