import React from "react";
import simple from "react-simple";
import gpsDistanceKm from "gps-distance";
import {last} from "lodash/fp";
import GithubIcon_ from "react-icons/lib/fa/github";

import {View, Title, Sep} from "./core";
import {addWeatherData} from "./weather-data";

const blue = "#1d576f";

const GithubIcon = simple(GithubIcon_, {
    height: 50,
    width: 50,
});

const SourcesTitle = simple(Title, {
    color: "white",
    marginTop: 10,
    marginBottom: 20,
});

const SourcesContainer = simple(View, {
    backgroundColor: blue,
    alignItems: "center",
});

const SourcesContent = simple(View, {
    // maxWidth: 400,
    alignItems: "center",
});

const SourceText = simple("div", {
    textAlign: "center",
    color: "white",
    marginBottom: 20,
});

const parseFmiLatLon = s => {
    const [latS, lonS] = s.trim().split(" ");
    return {
        lat: parseFloat(latS, 10),
        lon: parseFloat(lonS, 10),
    };
};

const gpsDistanceM = (from, to) => {
    const km = gpsDistanceKm(
        ...[from.lat, from.lon, to.lat, to.lon].map(s => parseFloat(s, 10))
    );

    return Math.round(km * 1000);
};

const Bold = simple("span", {
    fontWeight: "bold",
});

const createMapLink = ({lat, lon}) =>
    `https://www.google.fi/maps/place/${lat},${lon}`;

const Link = simple(Bold.create("a"), {
    color: "skyblue",
    textDecoration: "none",
    ":visited": {
        color: "skyblue",
    },
    ":active": {
        color: "skyblue",
    },
});

const StationDesc = ({name, from, to}) => (
    <span>
        <Link href={createMapLink(from)}>
            {name}
        </Link>
        {" "}
        <Bold>
            {gpsDistanceM(from, to)}
            {" "}
            metrin
        </Bold>{" "}
        päässä{" "}
        <Link href={createMapLink(to)}>
            laskeutumisalueesta
        </Link>
    </span>
);

const Metar = simple("span", {
    backgroundColor: "white",
    color: blue,
    padding: 5,
    borderRadius: 5,
    fontFamily: "monospace",
    fontWeight: "bold",
    // border: "1px solid ",
});

var Sources = (
    {dzProps, gusts, windAvg, windAvgForecasts, gustForecasts, metars}
) => (
    <SourcesContainer>
        <Sep />
        <Sep />
        <SourcesContent>
            <SourcesTitle>Lähteet</SourcesTitle>

            <SourceText>
                Kaikki data on haettu Ilmatieteen laitoksen
                {" "}
                <Link href="https://ilmatieteenlaitos.fi/avoin-data">
                    avoimista rajapinnoista
                </Link>
            </SourceText>

            {gusts &&
                <SourceText>
                    Puuskatiedot saatiin mittausasemalta{" "}
                    <StationDesc
                        name={gusts.stationName}
                        from={parseFmiLatLon(gusts.stationCoordinates)}
                        to={dzProps}
                    />
                </SourceText>}

            {windAvg &&
                <SourceText>
                    Keskituulitiedot saatiin mittausasemalta{" "}
                    <StationDesc
                        name={windAvg.stationName}
                        from={parseFmiLatLon(windAvg.stationCoordinates)}
                        to={dzProps}
                    />
                </SourceText>}

            {gustForecasts &&
                <SourceText>
                    Puuskaennustus on annettu alueelle
                    {" "}
                    <Bold>{gustForecasts.locationName}</Bold>
                </SourceText>}

            {windAvgForecasts &&
                <SourceText>
                    Keskituuliennustus on annettu alueelle
                    {" "}
                    <Bold>{windAvgForecasts.locationName}</Bold>
                </SourceText>}

            {Boolean(metars && metars.length > 0) &&
                <SourceText>
                    Pilvikerrokset parsittiin METAR-sanomasta:
                    <br />
                    <br />
                    <Metar>{last(metars).raw}</Metar>
                </SourceText>}

            <SourcesTitle>Tietoja</SourcesTitle>

            <SourceText>
                Tällä sivulla annettujen tietojen käyttö omalla vastuulla.
                Kukaan tai mikään ei takaa, että lähdetiedot tai niiden tulkinta
                olisi millään tapaan järjellistä.
            </SourceText>

            <SourceText>
                Tämän tunkin rakensi
                {" "}
                <Link href="https://www.facebook.com/esamattisuuronen">
                    Esa-Matti Suuronen.
                </Link>
            </SourceText>

            <SourceText>
                <Link href="https://github.com/skydivejkl/hyppykeli.fi">
                    Lähdekoodit Githubista
                    <br />
                    <GithubIcon />
                </Link>
            </SourceText>

        </SourcesContent>
    </SourcesContainer>
);
Sources = addWeatherData(Sources);

export default Sources;
