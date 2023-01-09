import {InfluxDB, Point} from "@influxdata/influxdb-client";
import fastify from "fastify";
import dotenv from 'dotenv';
import rateLimit from "@fastify/rate-limit";

dotenv.config()

function notNull<T>(name: string, value: T | null | undefined) {
    if (value == null) throw `${name} missing from env`;
    return value;
}

const PORT = parseInt(notNull('Port', process.env['PORT']))
const URL = notNull('InfluxDB URL', process.env['INFLUX_URL'])
const TOKEN =  notNull('InfluxDB Token', process.env['INFLUX_TOKEN'])
const ORG =  notNull('InfluxDB Org', process.env['INFLUX_ORG'])
const BUCKET =  notNull('InfluxDB Bucket', process.env['INFLUX_BUCKET'])
interface ServerInfo {
    id: string,
    platform: string,
    store: string,
    pluginVersion: string,
    minecraftVersion: string,
}

const writeApi = new InfluxDB({url: URL, token: TOKEN}).getWriteApi(ORG, BUCKET, 'ns')

async function write(serverInfo: ServerInfo) {
    writeApi.writePoint(new Point("servers")
        .tag("platform", serverInfo.platform)
        .tag("minecraftVersion", serverInfo.minecraftVersion)
        .tag("pluginVersion", serverInfo.pluginVersion)
        .tag("store", serverInfo.store)
        .stringField("id", serverInfo.id)
    );
    await writeApi.flush()
}

const server = fastify()

server.register(rateLimit, {
    max: 60,
    timeWindow: "1 hour"
})

server.get('/', (req, res) => res.status(204).send())

server.post('/v1',
    {
        schema: {
            body: {
                type: "object",
                properties: {
                    id: {type: 'string'},
                    platform: {type: 'string'},
                    store: {type: 'string'},
                    pluginVersion: {type: 'string'},
                    minecraftVersion: {type: 'string'}
                },
                required: ['id', 'platform', 'store', 'pluginVersion', 'minecraftVersion']
            }
        }
    },
    async (req, res) => {
        if (!req.headers["user-agent"]?.match(/ProNouns\/.+/)) return res.status(400).send();
        const body = req.body as ServerInfo
        body.id = (Math.random() + 1).toString(36).substring(2);
        try {
            await write(body)
            res.status(204).send()
        } catch (ex) {
            res.status(500).send()
        }
    })

await server.listen({ port: PORT })
console.log(`Listening on port ${PORT}`)

