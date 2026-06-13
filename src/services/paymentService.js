
import dotenv from "dotenv";
import { MercadoPagoConfig, Payment } from 'mercadopago';

dotenv.config();

const client = new MercadoPagoConfig({ accessToken: process.env.MERCADOPAGO_ACCESS_TOKEN });

export const gerarPix = async (valor) => {
    if (!valor) {
        return { mensagem: 'O campo "valor" é obrigatório.' };
    }

    // Monta o payload de criação do pagamento PIX para o Mercado Pago.
    const data = { email: "jeancastilho646@gmail.com", nome: "jean", sobrenome: "castilho", cpf: 17984881758 };
    const valorInteiro = parseFloat(valor).toFixed(2);
    const payment_data = {
        transaction_amount: parseFloat(valorInteiro),
        description: 'Pagamento PIX - Encanto Rústico',
        payment_method_id: 'pix',
        payer: {
            email: data.email,
            first_name: data.nome,
            last_name: data.sobrenome,
            identification: {
                type: 'CPF',
                number: data.cpf,
            },
        },
    };

    try {
        const payment = new Payment(client);
        const result = await payment.create({ body: payment_data });

        console.log(result);

        // Retorna apenas os campos necessários para renderizar a página de pagamento.
        const transactionData = result.point_of_interaction?.transaction_data ?? result.transaction_data ?? {};
        const { qr_code, qr_code_base64 } = transactionData;

        return {
            id: result.id,
            status: result.status,
            transaction_amount: result.transaction_amount,
            qr_code,
            qr_code_base64,
        };
    } catch (error) {
        console.error('Erro ao gerar PIX:', error);
        return { error: 'Erro ao gerar PIX' };
    }
};

export const consultarPix = async (id) => {
    if (!id) {
        return { mensagem: 'O campo "id" é obrigatório.' };
    }

    try {
        const payment = new Payment(client);
        const paymentInfo = await payment.get({ id });

        // Retorna o objeto completo de pagamento para que o webhook
        // ou a lógica de confirmação possam ler o status real.
        return paymentInfo;
    } catch (error) {
        console.error('Erro ao consultar PIX:', error);
        return { error: 'Erro ao consultar PIX' };
    }
};
