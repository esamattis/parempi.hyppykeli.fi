// @ts-check
// docs https://opendata.fmi.fi/wfs?service=WFS&version=2.0.0&request=describeStoredQueries&
import { computed, signal } from "@preact/signals";

/**
 * @typedef {import('@preact/signals').Signal<T>} Signal<T>
 * @template {any} T
 */

/**
 * @typedef {"fmi::avi::observations::iwxxm" | "fmi::observations::weather::timevaluepair" | "fmi::forecast::edited::weather::scandinavia::point::timevaluepair" } StoredQuery
 */

/**
 * @typedef {Object} WeatherData
 * @property {number} gust
 * @property {number} speed
 * @property {number} direction
 * @property {number|undefined} cloudCover
 * @property {Date} time
 */

/**
 * @typedef {Object} CloudLayer
 * @property {number} base
 * @property {string} amount
 * @property {string} unit
 * @property {string} href
 */

/**
 * @typedef {Object} MetarData
 * @property {CloudLayer[]} clouds
 * @property {string} metar
 * @property {Date} time
 * @property {number} elevation
 */

/**
 * @type {Signal<string|undefined>}
 */
export const NAME = signal(undefined);

/**
 * @type {Signal<number>}
 */
export const LOADING = signal(0);

/**
 * @type {Signal<boolean>}
 */
export const STALE_FORECASTS = signal(true);

/**
 * @type {Signal<string | undefined>}
 */
export const STATION_NAME = signal(undefined);

/**
 * @type {Signal<WeatherData[]>}
 */
export const OBSERVATIONS = signal([]);

/**
 * @type {Signal<WeatherData|undefined>}
 */
export const HOVERED_OBSERVATION = signal(undefined);

/**
 * @type {Signal<WeatherData[]>}
 */
export const FORECASTS = signal([]);

/**
 * @type {Signal<number>}
 */
export const GUST_TREND = computed(() => {
    const maxAge = Date.now() + 1000 * 60 * 60;
    const latestGust = OBSERVATIONS.value.at(-1)?.gust ?? 0;

    const recentGusts = FORECASTS.value.flatMap((point) => {
        if (point.time.getTime() <= maxAge) {
            return point.gust;
        }

        return [];
    });

    if (recentGusts.length === 0) {
        return 0;
    }

    const avg =
        recentGusts.reduce((sum, gust) => sum + gust, 0) / recentGusts.length;

    return -latestGust + avg;
});

/**
 * @type {Signal<MetarData[] | undefined>}
 */
export const METARS = signal(undefined);

/**
 * @type {Signal<string|null>}
 */
export const LATLONG = signal(null);

/**
 * @type {Signal<string[]>}
 */
export const ERRORS = signal([]);

/**
 *  How many days in the future the forecast is for.
 *  0 = today, 1 = tomorrow, 2 = day after tomorrow, etc.
 *
 * @type {Signal<number>}
 */
export const FORECAST_DAY = signal(0);

/**
 * @type {Signal<Date>}
 */
export const FORECAST_DATE = computed(() => {
    const day = FORECAST_DAY.value;

    STALE_FORECASTS.value = true;

    if (day === 0) {
        return new Date();
    }

    const date = new Date();
    date.setDate(date.getDate() + day);
    return date;
});

/**
 * @type {Signal<{ [K in StoredQuery]?: string}>}
 */
export const RAW_DATA = signal({});

/** @type {ReturnType<typeof setTimeout>} */
let timer;

HOVERED_OBSERVATION.subscribe(() => {
    clearTimeout(timer);

    timer = setTimeout(() => {
        HOVERED_OBSERVATION.value = undefined;
    }, 5_000);
});

document.addEventListener("click", (e) => {
    if (e.target instanceof HTMLElement && !e.target.closest(".chart")) {
        HOVERED_OBSERVATION.value = undefined;
    }
});

const OBSERVATION_PARAMETERS = [
    "winddirection",
    "windspeedms",
    "windgust",
    "n_man",
];

const FORECAST_PAREMETERS = [
    "winddirection",
    "windspeedms",
    "windgust",
    "maximumwind",
];

/**
 * Makes a request to the FMI API with the given options.
 * @param {StoredQuery} storedQuery - The stored query ID for the request.
 * @param {Object} params - The parameters for the request.
 * @param {string} [mock]
 * @returns {Promise<Document|undefined|"error">} The parsed XML document from the response.
 * @throws Will throw an error if the request fails.
 */
export async function fmiRequest(storedQuery, params, mock) {
    const allowMock = new URL(location.href).searchParams.has("mock");
    if (!allowMock) {
        mock = undefined;
    }

    const url = new URL(`https://opendata.fmi.fi/wfs?request=getFeature`);
    url.searchParams.set("storedquery_id", storedQuery);
    for (const [k, v] of Object.entries(params)) {
        url.searchParams.set(k, v);
    }

    LOADING.value += 1;
    try {
        const response = await fetch(mock ?? url);
        if (response.status === 404) {
            return;
        }

        if (!response.ok) {
            return "error";
        }

        let data;
        try {
            const text = await response.text();
            RAW_DATA.value = {
                ...RAW_DATA.value,
                [storedQuery]: text,
            };
            const parser = new DOMParser();
            data = parser.parseFromString(text, "application/xml");
        } catch (error) {
            console.error("ERROR", url.toString(), error);
            return "error";
        }

        return data;
    } finally {
        LOADING.value -= 1;
    }
}

/**
 * @param {Document} doc
 * @param {string} path
 * @returns {Element|null}
 */
function xpath(doc, path) {
    const node = doc.evaluate(
        path,
        doc,
        function (prefix) {
            switch (prefix) {
                case "wml2":
                    return "http://www.opengis.net/waterml/2.0";
                case "gml":
                    return "http://www.opengis.net/gml/3.2";
                default:
                    return null;
            }
        },
        XPathResult.FIRST_ORDERED_NODE_TYPE,
        null,
    ).singleNodeValue;

    if (node instanceof Element) {
        return node;
    }

    return null;
}

/**
 * @param {Element} node
 */
function pointsToTimeSeries(node) {
    return Array.from(node.querySelectorAll("point")).map((point) => {
        return {
            value: Number(point.querySelector("value")?.innerHTML ?? 0),
            time: new Date(
                point.querySelector("time")?.innerHTML ?? new Date(),
            ),
        };
    });
}

/**
 * @param {Document} doc
 * @param {string} id
 */
function parseTimeSeries(doc, id) {
    const node = xpath(doc, `//wml2:MeasurementTimeseries[@gml:id="${id}"]`);
    if (!node) {
        return [];
    }

    return pointsToTimeSeries(node);
}

/**
 * @param {Document} xml
 * @returns {MetarData[]}
 */
function parseClouds(xml) {
    const members = Array.from(xml.querySelectorAll("member"));

    return members.flatMap((member) => {
        const time = new Date(
            member.querySelector("timePosition")?.innerHTML ?? new Date(),
        );

        const elevation = Number(
            member.querySelector("fieldElevation")?.innerHTML ?? -1,
        );

        const metar = member.querySelector("source input")?.innerHTML;

        if (!metar) {
            return [];
        }

        const cloudNodes = member
            .querySelector("MeteorologicalAerodromeObservationRecord cloud")
            ?.querySelectorAll("CloudLayer");

        const clouds = Array.from(cloudNodes ?? []).flatMap((xml) => {
            const base = xml.querySelector("base");
            if (!base) {
                return [];
            }

            const amountHref = xml
                .querySelector("amount")
                ?.getAttribute("xlink:href");

            if (!amountHref) {
                return [];
            }

            // https://codes.wmo.int/bufr4/codeflag/0-20-008/1
            const amount = new URL(amountHref).pathname.split("/").pop();

            if (!amount) {
                return [];
            }

            return {
                amount,
                base: Number(base?.innerHTML),
                unit: base?.getAttribute("uom") ?? "?",
                href: amountHref,
            };
        });

        return {
            time,
            elevation,
            clouds,
            metar,
        };
    });
}

/**
 * @param {string} msg
 */
export function addError(msg) {
    ERRORS.value = [...ERRORS.value, msg];
}

export async function updateWeatherData() {
    ERRORS.value = [];
    const url = new URL(location.href);
    const fmisid = url.searchParams.get("fmisid");
    const icaocode = url.searchParams.get("icaocode");
    const forecastDay = Number(url.searchParams.get("forecast_day")) || 0;
    const obsRange = Number(url.searchParams.get("observation_range")) || 12;
    const forecastRange = Number(url.searchParams.get("forecast_range")) || 8;

    NAME.value = icaocode ?? undefined;
    FORECAST_DAY.value = forecastDay;

    const obsStartTime = new Date();
    obsStartTime.setHours(obsStartTime.getHours() - obsRange, 0, 0, 0);

    const cacheBust = Math.floor(Date.now() / 30_000);

    if (icaocode) {
        fmiRequest(
            "fmi::avi::observations::iwxxm",
            {
                cch: cacheBust,
                starttime: obsStartTime.toISOString(),
                icaocode,
            },
            "/example_data/metar.xml",
        ).then((xml) => {
            if (!xml) {
                addError(`Tuntematon lentokenttä tunnus ${icaocode}.`);
                return;
            }

            if (xml === "error") {
                addError(`Virhe METAR-sanomaa hakiessa kentälle ${icaocode}.`);
                return;
            }

            const clouds = parseClouds(xml);
            METARS.value = clouds;
        });
    } else {
        addError("Lentokenttä tunnus (ICAO) puuttuu.");
    }

    const doc = await fmiRequest(
        "fmi::observations::weather::timevaluepair",
        {
            cch: cacheBust,
            starttime: obsStartTime.toISOString(),
            // endtime:
            parameters: OBSERVATION_PARAMETERS.join(","),
            fmisid,
        },
        "/example_data/observations.xml",
    );

    if (!doc) {
        addError(`Havaintoasemaa ${fmisid} ei löytynyt.`);
        return;
    }

    if (doc === "error") {
        addError(`Virhe havaintoaseman ${fmisid} tietojen hakemisessa.`);
        return;
    }

    // <gml:name codeSpace="http://xml.fmi.fi/namespace/locationcode/name">Kouvola Utti lentoasema</gml:name>
    const name = xpath(
        doc,
        "//gml:name[@codeSpace='http://xml.fmi.fi/namespace/locationcode/name']",
    )?.innerHTML;

    if (!name) {
        addError(`Havaintoasema ${fmisid} ei taida toimia tässä.`);
        return;
    }

    STATION_NAME.value = name;
    if (!NAME.value) {
        NAME.value = name;
    }

    const coordinates = doc
        .querySelector("pos")
        ?.innerHTML.trim()
        .split(/\s+/)
        .join(",");

    LATLONG.value = coordinates ?? null;

    const gusts = parseTimeSeries(doc, "obs-obs-1-1-windgust").reverse();
    const windSpeed = parseTimeSeries(doc, "obs-obs-1-1-windspeedms").reverse();
    const directions = parseTimeSeries(
        doc,
        "obs-obs-1-1-winddirection",
    ).reverse();

    /** @type {WeatherData[]} */
    const combined = gusts.map((gust, i) => {
        return {
            gust: gust.value,
            speed: windSpeed[i]?.value ?? -1,
            direction: directions[i]?.value ?? -1,
            cloudCover: undefined,
            time: gust.time,
        };
    });

    OBSERVATIONS.value = combined;

    const forecastStartTime = new Date();
    const forecastEndTime = new Date();
    forecastEndTime.setHours(
        forecastEndTime.getHours() + forecastRange,
        0,
        0,
        0,
    );

    const day = FORECAST_DAY.value;
    if (day > 0) {
        forecastStartTime.setHours(7, 0, 0, 0);
        forecastStartTime.setDate(forecastStartTime.getDate() + day);
        forecastEndTime.setHours(21, 0, 0, 0);
        forecastEndTime.setDate(forecastEndTime.getDate() + day);
    }

    const forecastXml = await fmiRequest(
        // "fmi::forecast::hirlam::surface::point::timevaluepair",
        // "ecmwf::forecast::surface::point::simple",
        // "ecmwf::forecast::surface::point::timevaluepair",
        "fmi::forecast::edited::weather::scandinavia::point::timevaluepair",
        {
            cch: cacheBust,

            starttime: forecastStartTime.toISOString(),
            endtime: forecastEndTime.toISOString(),

            timestep: 10,
            // parameters: FORECAST_PAREMETERS.join(","),
            // parameters: "WindGust",
            parameters:
                "HourlyMaximumGust,WindDirection,WindSpeedMS,MiddleAndLowCloudCover",
            // place: "Utti",
            latlon: coordinates,
        },
        "/example_data/forecast.xml",
    );

    if (forecastXml === "error") {
        addError("Virhe ennusteiden hakemisessa.");
        return;
    }

    if (!forecastXml) {
        addError("Ennusteita ei löytynyt");
        return;
    }

    const gustForecasts = parseTimeSeries(
        forecastXml,
        "mts-1-1-HourlyMaximumGust",
    );

    const speedForecasts = parseTimeSeries(forecastXml, "mts-1-1-WindSpeedMS");

    const directionForecasts = parseTimeSeries(
        forecastXml,
        "mts-1-1-WindDirection",
    );

    const cloudCoverForecasts = parseTimeSeries(
        forecastXml,
        "mts-1-1-MiddleAndLowCloudCover",
    );

    /** @type {WeatherData[]} */
    const combinedForecasts = gustForecasts.map((gust, i) => {
        return {
            gust: gust.value,
            direction: directionForecasts[i]?.value ?? -1,
            speed: speedForecasts[i]?.value ?? -1,
            time: gust.time,
            cloudCover: cloudCoverForecasts[i]?.value,
        };
    });

    FORECASTS.value = combinedForecasts;
    STALE_FORECASTS.value = false;
}

updateWeatherData().then(() => {
    const fragment = location.hash;
    if (!fragment) {
        return;
    }

    let element;

    try {
        element = document.querySelector(fragment);
    } catch (error) {}

    if (element) {
        element.scrollIntoView();
    }
});

document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
        updateWeatherData();
    }
});

window.addEventListener("pageshow", (event) => {
    if (event.persisted) {
        updateWeatherData();
    }
});

setInterval(updateWeatherData, 60000);
