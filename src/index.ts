import {InfluxDB, Point} from "@influxdata/influxdb-client";
import fastify from "fastify";
import dotenv from 'dotenv';
import rateLimit from "@fastify/rate-limit";
import * as fs from "fs/promises";
import Project from "./project.js";

dotenv.config()

function notNull<T>(name: string, value: T | null | undefined) {
    if (value == null) throw `${name} missing from env`;
    return value;
}

const PORT = parseInt(notNull('Port', process.env['PORT']))
const URL = notNull('InfluxDB URL', process.env['INFLUX_URL'])
const TOKEN = notNull('InfluxDB Token', process.env['INFLUX_TOKEN'])
const influx = new InfluxDB({url: URL, token: TOKEN})

const server = fastify()

const config = JSON.parse(await fs.readFile('config.json', 'utf-8')) as Project[]

console.log(`Loaded ${config.length} projects (${config.map(c => c.name).join(', ')})`)

server.register(rateLimit, {
    max: 60,
    timeWindow: "1 hour"
})

server.get('/', (req, res) => res.status(204).send())

async function handle(userAgent: string | undefined, body: any): Promise<{ code: number } & ({ error: string } | { point: Point })> {
    if (userAgent == null) return {code: 400, error: 'Missing user agent'}
    const project = config.find(p => userAgent.toLowerCase().startsWith(`${p.name.toLowerCase()}/`))
    if (project == null) return {code: 400, error: 'Invalid user agent'}
    if (typeof body !== 'object' || body == null) return {code: 422, error: 'Invalid body'}

    const point = new Point()
    for (const [name, field] of Object.entries(project.fields)) {
        const value = body[name]
        if (value == null) {
            if (field.optional ?? false) continue
            return {code: 422, error: `Missing required field ${name}`}
        }
        if (typeof value !== field.type) return {
            code: 422,
            error: `Expected type ${field.type} for ${name} but got ${typeof value}`
        }
        if (typeof value == "string") {
            if (value.length === 0) return {code: 422, error: `${value} must not have a length of 0`}
            if (value.endsWith(`\\`)) return {code: 422, error: `${value} must not end with a backslash`}
        }
        point.tag(name, `${value}`)
    }

    if (body.id == null) return {code: 422, error: 'Missing required field id'}
    point.stringField('id', body.id)

    const writeApi = influx.getWriteApi(project.influx.org, project.influx.bucket, 'ns')
    writeApi.writePoint(point)
    await writeApi.flush()
    return {code: 204, point}
}

server.post('/v1', async (req, res) => {
    try {
        const result = await handle(req.headers["user-agent"], req.body)
        res.status(result.code)
        if ('error' in result) return res.send(result);

        res.send()
    } catch (ex) {
        res.status(500).send()
    }
})

await server.listen({port: PORT, host: '0.0.0.0'})
console.log(`Listening on port ${PORT}`)

