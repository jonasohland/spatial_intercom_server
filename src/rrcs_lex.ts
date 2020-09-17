import * as Logger from './log'
import {ArtistPortInfo} from './rrcs'
import {
    Crosspoint,
    CrosspointSync,
    CrosspointSyncType,
    CrosspointVolumeTarget,
    makeConferenceVolumeTarget,
    makeSingleVolumeTarget,
    makeXPSync,
    makeXPVolumeSource,
    xpvtid
} from './rrcs_defs'

const log = Logger.get('RRCSLX');

export function parsePorts(ports: ArtistPortInfo[])
{
    let masters: CrosspointSync[] = [];
    let exprs: RRCSExpression[]   = [];

    ports.forEach(port => {
        if (port.Subtitle)
            parseRRCSExpressions(
                exprs, RRCSExpressionSource.SUBTITLE, port.Subtitle, port);

        if (port.Name)
            parseRRCSExpressions(
                exprs, RRCSExpressionSource.NAME, port.Name, port);

        if (port.Label)
            parseRRCSExpressions(
                exprs, RRCSExpressionSource.LABEL, port.Label, port);

        if (port.Alias)
            parseRRCSExpressions(
                exprs, RRCSExpressionSource.ALIAS, port.Alias, port);
    });

    let ids: RRCSPortID[]
        = <RRCSPortID[]>exprs.filter(ex => ex.type === RRCSExpressions.PORT_ID);
    let vts: RRCSVolumeTargetExpression[]
        = <RRCSVolumeTargetExpression[]>exprs.filter(
            ex => ex.type === RRCSExpressions.SYNC_VOLUME_TARGET);

    for (let tgt of vts) {

        let srcid  = findPortForID(ids, tgt.volsrc_src, true);
        let destid = findPortForID(ids, tgt.volsrc_dest, false);

        if (srcid == null || destid == null) {
            log.error(`Failed to build VolumeTarget (${tgt.volsrc_src}/${
                tgt.volsrc_dest})`);
            continue;
        }

        let masterxp: Crosspoint = {
            Source : {
                Node : srcid.port.Node,
                Port : srcid.port.Port,
                IsInput : true
            },
            Destination : {
                Node : destid.port.Node,
                Port : destid.port.Port,
                IsInput : false
            }
        }

        let slavesrc
            = findPortForID(ids, tgt.fromxp_src, true);

        if (slavesrc == null) {
            log.error(`Could not find source port for volume target XP`);
            return;
        }

        let slavexp: Crosspoint = {
            Source : {
                Node : slavesrc.port.Node,
                Port : slavesrc.port.Port,
                IsInput : true
            },
            Destination :
                { Node : tgt.port.Node, Port : tgt.port.Port, IsInput : false }
        }

        let confmaster
            = makeXPSync(makeXPVolumeSource(masterxp, true));
        let singlemaster = makeXPSync(makeXPVolumeSource(masterxp, false));

        if (tgt.use_conf && tgt.use_single) {
            if (tgt.single && tgt.conf) {
                confmaster.slaves.push(makeConferenceVolumeTarget(slavexp));
                singlemaster.slaves.push(makeSingleVolumeTarget(slavexp));
            }
            else {
                if (tgt.single) {
                    confmaster.slaves.push(makeSingleVolumeTarget(slavexp));
                    singlemaster.slaves.push(makeSingleVolumeTarget(slavexp));
                }
                else if (tgt.conf) {
                    confmaster.slaves.push(makeConferenceVolumeTarget(slavexp));
                    singlemaster.slaves.push(
                        makeConferenceVolumeTarget(slavexp));
                }
            }
            masters.push(confmaster, singlemaster);
        }
        else if (tgt.use_conf) {
            if (tgt.single && tgt.conf) {
                confmaster.slaves.push(makeConferenceVolumeTarget(slavexp));
                confmaster.slaves.push(makeSingleVolumeTarget(slavexp));
            }
            else {
                if (tgt.single)
                    confmaster.slaves.push(makeSingleVolumeTarget(slavexp));
                else if (tgt.conf)
                    confmaster.slaves.push(makeConferenceVolumeTarget(slavexp));
            }
            masters.push(confmaster);
        }
        else if (tgt.use_single) {
            if (tgt.single && tgt.conf) {
                singlemaster.slaves.push(makeConferenceVolumeTarget(slavexp));
                singlemaster.slaves.push(makeSingleVolumeTarget(slavexp));
            }
            else {
                if (tgt.single)
                    singlemaster.slaves.push(makeSingleVolumeTarget(slavexp));
                else if (tgt.conf)
                    singlemaster.slaves.push(
                        makeConferenceVolumeTarget(slavexp));
            }
            masters.push(singlemaster);
        }
    }

    return masters;
}

function mergeslaves(xps: CrosspointSync, slvs: CrosspointVolumeTarget[])
{
}

function findPortForID(ids: RRCSPortID[], id: string, input: boolean)
{
    return ids.find(
        i => i.id === id
             && ((i.port.Input === input) || (i.port.Output !== input)));
}

enum RRCSExpressionSource {
    NAME,
    LABEL,
    ALIAS,
    SUBTITLE
}

enum RRCSExpressions {
    ANY,
    PORT_ID,
    SYNC_VOLUME_TARGET,
    SYNC_XP_TARGET
}

interface RRCSExpression {
    port: ArtistPortInfo;
    type: RRCSExpressions;
    str: string;
    source: RRCSExpressionSource;
}

interface RRCSPortID extends RRCSExpression {
    id: string
}

interface RRCSVolumeTargetExpression extends RRCSExpression {
    fromxp_src: string;
    volsrc_src: string;
    volsrc_dest: string;
    conf: boolean;
    single: boolean;
    use_conf: boolean;
    use_single: boolean;
}

interface RRCSSetCrosspointExpression extends RRCSExpression {
}

function _exprs_add_setxp(
    exprs: RRCSExpression[], origin: RRCSExpression, expr: string)
{
    let exprobj = <RRCSSetCrosspointExpression>origin;
    exprs.push(exprobj);
}

function _exprs_add_voltgt(
    exprs: RRCSExpression[], origin: RRCSExpression, char: string, expr: string)
{
    let exprobj    = <RRCSVolumeTargetExpression>origin;
    let fromxp_tgt = expr.split('/');
    let fromxp     = fromxp_tgt[0];
    let vsource;

    exprobj.use_conf   = char === '&' || char === '~';
    exprobj.use_single = char === '+' || char === '~';


    if (fromxp == null) {
        log.error(
            `Error lexing rrcs expressions in config: Could not extract XPVolume target XP source port from string '${
                expr}'`);
        return;
    }

    if (fromxp_tgt[1]) {
        if (fromxp_tgt[1].indexOf('+') != -1) {
            vsource        = fromxp_tgt[1].split('+');
            exprobj.single = true;
            exprobj.conf   = false;
        }
        else if (fromxp_tgt[1].indexOf('&') != -1) {
            vsource        = fromxp_tgt[1].split('&');
            exprobj.conf   = true;
            exprobj.single = false;
        }
        else if (fromxp_tgt[1].indexOf('~') != -1) {
            vsource        = fromxp_tgt[1].split('~');
            exprobj.single = true;
            exprobj.conf   = true;
        }
    }

    if (vsource == null || vsource.length < 1) {
        log.error(
            `Error lexing rrcs expressions in config: Could not extract XPVolume source from string ${
                expr}`);
        return;
    }

    exprobj.fromxp_src = fromxp;

    if (vsource[0] == '') {
        exprobj.volsrc_src  = fromxp;
        exprobj.volsrc_dest = vsource[1];
    }
    else if (vsource[0].length > 0) {
        exprobj.volsrc_src  = vsource[0];
        exprobj.volsrc_dest = vsource[1];
    }
    else {
        log.error(`Could not extract volume sync target from string ${expr}`);
        return;
    }

    exprobj.type = RRCSExpressions.SYNC_VOLUME_TARGET;

    log.debug(`Found [${
        RRCSExpressions[RRCSExpressions.SYNC_VOLUME_TARGET]}] expression in [${
        RRCSExpressionSource[origin.source]}] of port [${
        exprobj.port.Name}]. Target XP src: '${
        exprobj.fromxp_src}' Source XP: (${exprobj.volsrc_src}/${
        exprobj.volsrc_dest})`);

    exprs.push(exprobj);
}

function _exprs_add_id(exprs: RRCSExpression[], origin: RRCSExpression,
                       expr: string, sec_ch: boolean)
{
    let exprobj  = <RRCSPortID>origin;
    exprobj.id   = expr;
    exprobj.type = RRCSExpressions.PORT_ID;

    if (exprobj.port.HasSecondChannel && sec_ch)
        exprobj.port.Port++;

    log.debug(`Found [${
        RRCSExpressions[RRCSExpressions.PORT_ID]}]            expression in [${
        RRCSExpressionSource[origin.source]}] of port [${origin.port.Name}]: ${
        exprobj.id} ${
        (sec_ch && exprobj.port.HasSecondChannel) ? '(applies to 2nd channel)'
                                                  : ''}`);

    exprs.push(exprobj);
}

function parseRRCSExpressions(exprlist: RRCSExpression[],
                              source: RRCSExpressionSource, str: string,
                              port: ArtistPortInfo)
{
    let exprs = str.split(' ');


    exprs.forEach(ex => {
        let origin: RRCSExpression
        = { port, str, source, type : RRCSExpressions.ANY };
        switch (ex.charAt(0)) {
            case '!': _exprs_add_setxp(exprlist, origin, ex.substr(1)); break;
            case '+':
                _exprs_add_voltgt(exprlist, origin, '+', ex.substr(1));
                break;
            case '&':
                _exprs_add_voltgt(exprlist, origin, '&', ex.substr(1));
                break;
            case '~':
                _exprs_add_voltgt(exprlist, origin, '~', ex.substr(1));
                break;
            case '$':
                _exprs_add_id(exprlist, origin, ex.substr(1), false);
                break;
            case '%':
                _exprs_add_id(exprlist, origin, ex.substr(1), true);
                break;
        }
    });
}