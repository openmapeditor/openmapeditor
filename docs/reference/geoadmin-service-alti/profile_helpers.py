import math

from shapely.geometry import LineString

from app.helpers.helpers import filter_altitude
from app.helpers.helpers import filter_coordinate
from app.helpers.helpers import filter_distance
from app.helpers.raster.georaster import RESOLUTION

PROFILE_MAX_AMOUNT_POINTS = 5000
PROFILE_DEFAULT_AMOUNT_POINTS = 200


def get_profile(
    geom=None,
    spatial_reference=None,
    nb_points=PROFILE_DEFAULT_AMOUNT_POINTS,
    offset=0,
    only_requested_points=False,
    smart_filling=False,
    keep_points=False,
    output_to_json=True,
    georaster_utils=None
):
    """Compute the alt=fct(dist) array and store it in c.points"""

    # get raster data from georaster.py
    if not georaster_utils:
        raise ValueError('No GeoRasterUtils, can\'t proceed')
    raster = georaster_utils.get_raster(spatial_reference)

    if only_requested_points:
        coordinates = geom.coords
    else:
        # filling lines defined by coordinates (linestring) with as much point as possible
        # (elevation model is a 2m mesh, so no need to go beyond that)
        coordinates = _create_points(
            coordinates=geom.coords,
            nb_points=nb_points,
            smart_filling=smart_filling,
            keep_points=keep_points
        )

    # extract z values (altitude over distance) for coordinates
    z_values = _extract_z_values(raster=raster, coordinates=coordinates)

    return _create_profile(
        coordinates=coordinates,
        # if offset is defined, do the smoothing
        z_values=_smooth(offset, z_values) if offset > 0 else z_values,
        output_to_json=output_to_json
    )


def _create_profile(coordinates, z_values, output_to_json):
    total_distance = 0
    previous_coordinates = None
    if output_to_json:
        profile = []
    else:
        # If the renderer is a csv file
        profile = {'headers': ['Distance', 'Altitude', 'Easting', 'Northing'], 'rows': []}

    for j, coord in enumerate(coordinates):
        if previous_coordinates is not None:
            total_distance += _distance_between(previous_coordinates, coord)
        # if the altitude is under 0 meters or is None, filter altitude returns None
        alt = filter_altitude(z_values[j])
        if alt is not None:
            rounded_dist = filter_distance(total_distance)
            if output_to_json:
                profile.append(
                    {
                        'alts': {
                            'COMB': alt, 'DTM2': alt, 'DTM25': alt
                        },
                        'dist': rounded_dist,
                        'easting': filter_coordinate(coord[0]),
                        'northing': filter_coordinate(coord[1])
                    }
                )
            # For csv file
            else:
                temp = [rounded_dist]
                if alt is not None:
                    temp.append(alt)
                temp.append(filter_coordinate(coord[0]))
                temp.append(filter_coordinate(coord[1]))
                profile['rows'].append(temp)
        previous_coordinates = coord
    return profile


def _prepare_number_of_points_max_per_segment(coordinates, nb_point_total):
    distances = []
    prev_coord = coordinates[0]
    for coord in coordinates[1:]:
        distances.append(_distance_between(prev_coord, coord))
        prev_coord = coord
    total_distance = sum(distances)
    # if the total distance is 0, we return the coordinates and that's it.
    if total_distance < 0.001:
        return [], []
    nb_points_segments = _obtain_nb_points_per_segment_no_loss(
        distances, nb_point_total, total_distance
    )
    return nb_points_segments, distances


def _obtain_nb_points_per_segment_no_loss(distances, nb_points_total, total_distance):
    nb_points_segments = []
    for d in distances:
        nb_points_segments.append(math.modf(max(nb_points_total * d / total_distance, 0.0)))
    sum_int = sum(int(nbp[1]) for nbp in nb_points_segments)
    while sum_int < nb_points_total:
        min_val, max_val, min_index, max_index = 1.0, 0.0, 0, 0
        for i, item in enumerate(nb_points_segments):
            if item[0] > 0.0:
                if item[0] < min_val:
                    min_index = i
                if item[0] > max_val:
                    max_index = i

        nb_points_segments[min_index] = (-0.5, nb_points_segments[min_index][1])
        nb_points_segments[max_index] = (-0.5, nb_points_segments[max_index][1] + 1.0)
        sum_int = sum(int(nbp[0]) for nbp in nb_points_segments)

        if min_val >= 1.0 and max_val <= 0.0:
            break
    return [int(nbp[1]) for nbp in nb_points_segments]


def _fill(coordinates, nb_points, is_smart=False):
    # pylint: disable=too-many-locals
    """
        Add some points in order to reach roughly the asked
        number of points.
    """
    # calculating distances between each points, and total distance
    distances = []
    prev_coord = [coordinates[0][0], coordinates[0][1]]
    for coord in coordinates[1:]:
        distances.append(_distance_between(prev_coord, coord))
        prev_coord = coord
    total_distance = sum(distances)
    # total_distance will be used as a divisor later, we have to check it's not zero
    if total_distance == 0:
        return coordinates
    prev_coord = [coordinates[0][0], coordinates[0][1]]
    result = [prev_coord]
    if is_smart:
        # for each segment, we will add points in between on a prorata basis (longer segments will
        # have more points)
        for i in range(1, len(coordinates)):
            # preparing segment properties before placing points
            segment_length = distances[i - 1]
            # if segment length is smaller than tiles resolution (2m) we don't add extra points
            if segment_length > RESOLUTION:
                segment = LineString([coordinates[i - 1], coordinates[i]])
                # here is the prorata ratio : if a segment makes X% of the total length, X% of total
                # points will be added to this segment
                ratio_distance = segment_length / total_distance
                # rounding number of points down to the closest integer (casting to int will ignore
                # anything after coma)
                nb_points_for_this_segment = int(nb_points * ratio_distance)
                # little protection against division by zero
                if nb_points_for_this_segment > 0:
                    segment_resolution = max(
                        segment_length / nb_points_for_this_segment, RESOLUTION
                    )
                    # if segment resolution is smaller than 2m, we force the resolution as it's
                    # wasteful to go below
                    segment_length_covered = 0
                    nb_points_placed = 0
                    while nb_points_placed != nb_points_for_this_segment \
                            and segment_length_covered < segment_length:
                        nb_points_placed += 1
                        segment_length_covered += segment_resolution
                        new_point = segment.interpolate(nb_points_placed * segment_resolution)
                        result.append([new_point.x, new_point.y])
        return result

    for i in range(1, len(coordinates)):
        coord = coordinates[i]
        cur_nb_points = max(int((nb_points - 1) * (distances[i - 1] / total_distance) + 0.5), 1)
        dx = (coord[0] - prev_coord[0]) / float(cur_nb_points)
        dy = (coord[1] - prev_coord[1]) / float(cur_nb_points)
        for j in range(1, cur_nb_points + 1):
            result.append([prev_coord[0] + dx * j, prev_coord[1] + dy * j])
        prev_coord = coord
    return result


def _fill_segment(coordinates, nb_points, is_smart, distance):
    result = [[coordinates[0][0], coordinates[0][1]]]
    if is_smart:
        # for each segment, we will add points in between on a prorata basis (longer segments will
        # have more points) preparing segment properties before placing points if segment length is
        # smaller than tiles resolution (2m) we don't add extra points
        if distance > RESOLUTION:
            segment = LineString([coordinates[0], coordinates[1]])
            # here is the prorata ratio : if a segment makes X% of the total length, X% of total
            # points will be added to this segment
            # rounding number of points down to the closest integer (casting to int will ignore
            # anything after coma) little protection against division by zero
            if nb_points > 0:
                segment_resolution = max(distance / nb_points, RESOLUTION)
                # if segment resolution is smaller than 2m, we force the resolution as it's wasteful
                # to go below
                segment_length_covered = 0
                nb_points_placed = 0
                while not nb_points_placed == nb_points \
                        and segment_length_covered < distance:
                    nb_points_placed += 1
                    segment_length_covered += segment_resolution
                    new_point = segment.interpolate(nb_points_placed * segment_resolution)
                    result.append([new_point.x, new_point.y])
                result.pop()
    else:
        prev_coord = result[0]
        nb_p = max(int(nb_points), 1)
        dx = (coordinates[1][0] - prev_coord[0]) / float(nb_p)
        dy = (coordinates[1][1] - prev_coord[1]) / float(nb_p)
        for i in range(1, nb_p + 1):
            result.append([prev_coord[0] + dx * i, prev_coord[1] + dy * i])
        result.pop()
    return result


def _create_points(coordinates, nb_points, smart_filling=False, keep_points=False):
    # is_smart = True means we are using the smart fill, which gives one point max per tile
    # depending of the resolution
    # is distinct = True means the coordinates must be present within the returned points.
    """
            Add some points in order to reach the requested number of points. If smart_filling is
            true, points will be added as close as possible as to not exceed the altitude model
            meshing (which is 2 meters). If not, they will be just thrown at equal distance without
            any regards to model resolution.
    """
    if not keep_points:
        return _fill(coordinates, nb_points, smart_filling)
    segments = []
    nb_points_per_segment, distances_per_segment = _prepare_number_of_points_max_per_segment(
        coordinates, nb_points - 1)
    if len(nb_points_per_segment) == 0:
        return coordinates
    coords = []
    for i in range(1, len(coordinates)):
        coords.append([coordinates[i - 1], coordinates[i]])
    for i, coordinate in enumerate(coords):
        segments = segments + _fill_segment(
            coordinate, nb_points_per_segment[i], smart_filling, distances_per_segment[i]
        )
    segments.append(coords[-1][1])
    return segments


def _extract_z_values(raster, coordinates):
    # keeping track of tiles that have been used for another coordinates (usually coordinates are
    # close together) this way we increase our chances to find the required tile without looking on
    # the whole country tiles
    tiles = []
    z_values = []
    for i, coordinate in enumerate(coordinates):
        x = coordinate[0]
        y = coordinate[1]
        z = None
        # looking into already used tile if this point is not included
        for already_used_tile in tiles:
            if already_used_tile.contains(x, y):
                z = already_used_tile.get_height_for_coordinate(x, y)
                break
        if z is None:
            tile = raster.get_tile(x, y)
            if tile is not None:
                tiles.append(tile)
                z = tile.get_height_for_coordinate(x, y)
        z_values.append(z)
    return z_values


def _smooth(offset, z_values):
    z_values_with_smoothing = []
    for j, z_value in enumerate(z_values):
        s = 0
        d = 0
        if z_value is None:
            z_values_with_smoothing.append(None)
            continue
        for k in range(-offset, offset + 1):
            p = j + k
            if p < 0 or p >= len(z_values):
                continue
            if z_values[p] is None:
                continue
            s += z_values[p] * _factor(k)
            d += _factor(k)
        z_values_with_smoothing.append(s / d)
    return z_values_with_smoothing


def _distance_between(coord1, coord2):
    """Compute the distance between 2 points"""
    return math.sqrt(math.pow(coord1[0] - coord2[0], 2.0) + math.pow(coord1[1] - coord2[1], 2.0))


def _factor(x):
    return float(1) / (abs(x) + 1)
