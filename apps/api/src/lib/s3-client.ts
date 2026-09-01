import { createHash, createHmac } from 'node:crypto';

/**
 * Cliente minimo de S3 con firma SigV4.
 *
 * Se escribe a mano en vez de traer @aws-sdk/client-s3 por dos razones. La primera es
 * el tamano: el SDK arrastra decenas de megas de dependencias a una imagen que ya se
 * cuelga compilando en un servidor sin memoria. La segunda es que aqui solo hacen
 * falta cuatro operaciones (subir, listar, borrar y comprobar el bucket), y la firma
 * de AWS esta especificada al detalle.
 *
 * Referencia: AWS Signature Version 4, "Authenticating Requests".
 */

const SERVICIO = 's3';
const ALGORITMO = 'AWS4-HMAC-SHA256';
/** Cuerpo ya conocido: se firma su sha256, no se usa el modo streaming. */
const sha256 = (dato: Buffer | string): string => createHash('sha256').update(dato).digest('hex');
const hmac = (clave: Buffer | string, dato: string): Buffer =>
  createHmac('sha256', clave).update(dato, 'utf8').digest();

export interface ConfigS3 {
  bucket: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  /** Para almacenamientos compatibles (MinIO, R2). Vacio: AWS. */
  endpoint?: string;
}

/**
 * Codifica cada segmento de la clave sin tocar las barras.
 *
 * `encodeURIComponent` escapa la barra, y AWS espera la ruta con sus separadores
 * intactos pero el resto de caracteres codificados.
 */
const rutaCanonica = (clave: string): string =>
  '/' + clave.split('/').map((parte) => encodeURIComponent(parte)).join('/');

/** Los parametros se ordenan por nombre y se codifican; AWS es estricto con esto. */
function consultaCanonica(parametros: Record<string, string | undefined>): string {
  return Object.entries(parametros)
    .filter(([, valor]) => valor !== undefined && valor !== '')
    .map(([nombre, valor]) => [encodeURIComponent(nombre), encodeURIComponent(valor!)])
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([nombre, valor]) => `${nombre}=${valor}`)
    .join('&');
}

interface PeticionFirmada {
  metodo: 'GET' | 'PUT' | 'DELETE' | 'HEAD';
  clave: string;
  parametros?: Record<string, string | undefined>;
  cuerpo?: Buffer;
  contentType?: string;
  cabecerasExtra?: Record<string, string>;
}

export class ClienteS3 {
  constructor(private readonly cfg: ConfigS3) {}

  private get host(): string {
    if (this.cfg.endpoint) return new URL(this.cfg.endpoint).host;
    // Estilo host virtual: el bucket va en el nombre de dominio.
    return `${this.cfg.bucket}.s3.${this.cfg.region}.amazonaws.com`;
  }

  private get base(): string {
    if (this.cfg.endpoint) return `${this.cfg.endpoint.replace(/\/+$/, '')}/${this.cfg.bucket}`;
    return `https://${this.host}`;
  }

  /** URL publica de un objeto, la que acaba en el navegador. */
  urlDe(clave: string): string {
    return `${this.base}${rutaCanonica(clave)}`;
  }

  private firmar({ metodo, clave, parametros = {}, cuerpo, contentType, cabecerasExtra = {} }: PeticionFirmada) {
    const ahora = new Date();
    const marca = ahora.toISOString().replace(/[:-]|\.\d{3}/g, ''); // 20260901T101530Z
    const dia = marca.slice(0, 8);
    const ambito = `${dia}/${this.cfg.region}/${SERVICIO}/aws4_request`;

    const hashCuerpo = sha256(cuerpo ?? Buffer.alloc(0));

    const cabeceras: Record<string, string> = {
      host: this.host,
      'x-amz-content-sha256': hashCuerpo,
      'x-amz-date': marca,
      ...(contentType ? { 'content-type': contentType } : {}),
      ...Object.fromEntries(Object.entries(cabecerasExtra).map(([k, v]) => [k.toLowerCase(), v])),
    };

    // Las cabeceras firmadas van en minusculas, ordenadas y con el valor recortado.
    const nombres = Object.keys(cabeceras).sort();
    const cabecerasCanonicas = nombres.map((n) => `${n}:${cabeceras[n].trim()}\n`).join('');
    const firmadas = nombres.join(';');

    const rutaConBucket = this.cfg.endpoint ? `/${this.cfg.bucket}${rutaCanonica(clave)}` : rutaCanonica(clave);

    const peticionCanonica = [
      metodo,
      rutaConBucket,
      consultaCanonica(parametros),
      cabecerasCanonicas,
      firmadas,
      hashCuerpo,
    ].join('\n');

    const porFirmar = [ALGORITMO, marca, ambito, sha256(peticionCanonica)].join('\n');

    // Cadena de derivacion: secreto -> dia -> region -> servicio -> peticion.
    const claveFirma = hmac(
      hmac(hmac(hmac(`AWS4${this.cfg.secretAccessKey}`, dia), this.cfg.region), SERVICIO),
      'aws4_request',
    );
    const firma = createHmac('sha256', claveFirma).update(porFirmar, 'utf8').digest('hex');

    return {
      url: `${this.base}${rutaConBucket.replace(`/${this.cfg.bucket}`, this.cfg.endpoint ? '' : '')}${
        consultaCanonica(parametros) ? '?' + consultaCanonica(parametros) : ''
      }`,
      cabeceras: {
        ...cabeceras,
        Authorization: `${ALGORITMO} Credential=${this.cfg.accessKeyId}/${ambito}, SignedHeaders=${firmadas}, Signature=${firma}`,
      },
    };
  }

  private async enviar(peticion: PeticionFirmada): Promise<Response> {
    const { url, cabeceras } = this.firmar(peticion);
    const destino = this.cfg.endpoint
      ? `${this.cfg.endpoint.replace(/\/+$/, '')}/${this.cfg.bucket}${rutaCanonica(peticion.clave)}${
          consultaCanonica(peticion.parametros ?? {}) ? '?' + consultaCanonica(peticion.parametros ?? {}) : ''
        }`
      : url;

    const respuesta = await fetch(destino, {
      method: peticion.metodo,
      headers: cabeceras,
      body: peticion.cuerpo,
    });

    if (!respuesta.ok && respuesta.status !== 404) {
      const detalle = await respuesta.text().catch(() => '');
      // El XML de error de AWS trae el motivo real dentro de <Message>.
      const mensaje = /<Message>([^<]+)<\/Message>/.exec(detalle)?.[1] ?? respuesta.statusText;
      throw new Error(`S3 ${peticion.metodo} ${peticion.clave}: ${respuesta.status} ${mensaje}`);
    }

    return respuesta;
  }

  async subir(clave: string, cuerpo: Buffer, contentType: string, cacheControl?: string): Promise<void> {
    await this.enviar({
      metodo: 'PUT',
      clave,
      cuerpo,
      contentType,
      ...(cacheControl ? { cabecerasExtra: { 'cache-control': cacheControl } } : {}),
    });
  }

  async borrar(clave: string): Promise<void> {
    await this.enviar({ metodo: 'DELETE', clave });
  }

  /** Todas las claves bajo un prefijo, siguiendo la paginacion de AWS. */
  async listar(prefijo: string): Promise<string[]> {
    const claves: string[] = [];
    let continuacion: string | undefined;

    do {
      const respuesta = await this.enviar({
        metodo: 'GET',
        clave: '',
        parametros: { 'list-type': '2', prefix: prefijo, 'continuation-token': continuacion },
      });
      const xml = await respuesta.text();

      for (const coincidencia of xml.matchAll(/<Key>([^<]+)<\/Key>/g)) {
        claves.push(coincidencia[1]);
      }

      const truncado = /<IsTruncated>true<\/IsTruncated>/.test(xml);
      continuacion = truncado
        ? /<NextContinuationToken>([^<]+)<\/NextContinuationToken>/.exec(xml)?.[1]
        : undefined;
    } while (continuacion);

    return claves;
  }

  /** Comprueba que el bucket existe y que las credenciales tienen acceso. */
  async comprobar(): Promise<void> {
    const respuesta = await this.enviar({ metodo: 'GET', clave: '', parametros: { 'list-type': '2', 'max-keys': '1' } });
    if (!respuesta.ok) throw new Error(`El bucket respondio ${respuesta.status}`);
  }
}
