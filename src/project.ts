export default interface Project {
    name: string,
    fields: {
        [field: string]: {
            type: "string" | "number" | "boolean",
            optional?: boolean
        }
    },
    influx: {
        org: string,
        bucket: string
    },
    collectLocation?: boolean
}

