/**
 * @file main.js
 */
(function ($, window, Drupal, drupalSettings, once) {
  "use strict";

  /**
   * Simple state management
   */
  const state = {
    element: null,
    tags: {},
    amenities: {},
    search: '',
    distance: '',
    filters: {
      tags: [],
      amenities: [],
    },
    addTag: function (tag, data) {
      if (!(tag in this.tags)) {
        this.tags[tag] = data;
        this.amenities[tag] = [];
      }
    },
    getTags: function () {
      return this.tags;
    },
    setSearch: function (query) {
      this.search = query;
      this.element.trigger('filterChanged:search', {search: this.search});
    },
    getSearch: function () {
      return this.search;
    },
    setDistance: function (distance) {
      this.distance = distance;
      this.element.trigger('filterChanged:distance', {distance: this.distance});
    },
    getDistance: function () {
      return this.distance;
    },
    addAmenities: function (tag, values) {
      // Merge old values with new values.
      const newValues = [...this.amenities[tag], ...values];
      // Filters array and returns only unique entries.
      this.amenities[tag] = [...new Set(newValues)];
    },
    getAvailableAmenities: function () {
      const all = this.getTagsFilter().reduce((all, tag) => {
        all = [...all, ...this.amenities[tag]]
        return all;
      }, []);

      return all.length > 0 ? [...new Set(all)] : this.getAllAmenities();
    },
    getAllAmenities: function () {
      const all = Object.keys(this.getTags()).reduce((all, tag) => {
        all = [...all, ...this.amenities[tag]]
        return all;
      }, []);

      return [...new Set(all)];
    },
    setTagsFilter: function (tags) {
      this.filters.tags = tags;
      this.element.trigger('filterChanged:tags', {tags: this.filters.tags});
    },
    setAmenitiesFilter: function (amenities) {
      this.filters.amenities = amenities.map(item => +item);
      this.element.trigger('filterChanged:amenities', {amenities: this.filters.amenities});
    },
    getTagsFilter: function () {
      return this.filters.tags;
    },
    getAmenitiesFilter: function () {
      return this.filters.amenities;
    }
  };

  Drupal.baseLayerWikimedia = {
    tilePattern: 'https://maps.wikimedia.org/osm-intl/{z}/{x}/{y}{r}.png',
    options: {
      attribution: '<a href="https://wikimediafoundation.org/wiki/Maps_Terms_of_Use">Wikimedia</a>',
      minZoom: 1,
      maxZoom: 19
    }
  };
  Drupal.baseLayerEsriWorldStreetMap = {
    tilePattern: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}',
    options: {
      attribution: 'Tiles &copy; Esri &mdash; Source: Esri, DeLorme, NAVTEQ, USGS, Intermap, iPC, NRCAN, Esri Japan, METI, Esri China (Hong Kong), Esri (Thailand), TomTom, 2012'
    }
  };
  Drupal.baseLayerEsriNatGeoWorldMap = {
    tilePattern: 'https://server.arcgisonline.com/ArcGIS/rest/services/NatGeo_World_Map/MapServer/tile/{z}/{y}/{x}',
    options: {
      attribution: 'Tiles &copy; Esri &mdash; National Geographic, Esri, DeLorme, NAVTEQ, UNEP-WCMC, USGS, NASA, ESA, METI, NRCAN, GEBCO, NOAA, iPC',
      maxZoom: 16
    }
  };
  Drupal.baseLayerOpenStreetMapMapnik = {
    tilePattern: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    options: {
      attribution: '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19
    }
  };

  const clickSelectedAmenity = function (e) {
    let value = $('input', e.target).val();
    if(!value) {
      value = $('input', e.currentTarget).val();
    }
    this.amenities_filter_el.find(`input[value=${value}]`).click();
  };

  Drupal.openyMap = function () {
    return {
      state: state,
      origin: `${window.location.origin}${drupalSettings.path.baseUrl}`,
      // Array of location data.
      locations: null,
      // URL of marker image.
      marker_image_url: null,
      // The Map object.
      map: null,
      // The distance filter limit, in miles.
      distance_limit: null,
      // The center point of the map.
      center_point: null,
      // The center point of a search location or distance limit.
      search_center_point: null,
      // Marker designating the center point.
      search_center_marker: null,

      /**
       * Utility functions.
       */
      // Checks if the provider library object has loaded
      libraryIsLoaded: function () {
        return typeof window.google !== 'undefined';
      },
      // Normalizes a map-vendor specific representation of
      // a coordinate point to a {lat:x, lon:y} object.
      normalize_point: function (point) {
        return {
          'lat': point.lat(),
          'lon': point.lng()
        };
      },
      // Convert a number from degrees to radians.
      toRad: function (n) {
        return n * Math.PI / 180;
      },
      // Geocoder.
      geocoder: function () {
        return typeof google.maps !== 'undefined' ? new google.maps.Geocoder() : {};
      },
      // Convert string to url format:
      // remove all non-alphanumeric characters, convert to lowercase,
      // replace spaces with dashes.
      encode_to_url_format: function (txt) {
        return txt
          .toLowerCase()
          .replace(/[^\w ]+/g, '')
          .replace(/ +/g, '-');
      },

      /**
       * Main functionality.
       */
      init: function (args) {
        this.component_el = args.component_el;
        this.locations = args.map_data;
        this.default_tags = drupalSettings.openyMapSettings.default_tags;

        this.init_state();

        this.marker_image_url = args.marker_image_url || null;
        this.search_center_marker = args.search_center_marker || null;

        this.map_el = this.component_el.find('.openy-map');
        this.messages_el = this.component_el.find('.messages');
        this.selected_amenities_el = this.component_el.find('.selected-amenities');

        this.map_controls_el = this.component_el.find('.map_controls');
        this.search_field_el = this.map_controls_el.find('input#search_field');
        this.distance_limit_el = this.map_controls_el.find('select#distance_limit');
        this.tag_filters_el = this.map_controls_el.find('.tag_filters');
        this.amenities_filter_el = this.map_controls_el.find('#amenities-filter');

        this.init_map();
        this.init_map_locations();
        this.draw_map_controls();
        this.hookup_map_controls_events();
        this.hookup_state_events();
        this.update_tag_filters();

        var mapLocation = document.location.href.match(/&?[amp;]?map_location=([\w|\+]*)&?[amp;]?/),
          component = this;

        this.component_el.find('.zip-code button.btn')
          .on('click', $.proxy(this.apply_search, this));

        this.search_field_el.on('keypress', (e) => {
          if (e.keyCode === 13) this.apply_search();
        });
        if (mapLocation) {
          this.search_field_el.val(mapLocation[1].replace(/\+/g, ' '));
          $('.distance_limit option').eq(2).attr('selected', true);
          $('.zip-code button.btn').click();
        }
      },

      init_state: function () {
        this.state.element = this.component_el;
        // Extract tags.
        this.locations.map((loc) => {
          if (!loc.tags) {
            return;
          }
          const tag = loc.tags[0];
          loc.tag = tag;
          this.state.addTag(tag, { 'marker_icon': loc.icon });
        });
        // Collect amenities
        this.locations.map((loc) => {
          const element = $(`article[data-openy-map-location-id=${loc.location_id}]`);
          if (element.length > 0) {
            loc.element = element;
            loc.amenities = element.data('amenities').map(el => +el) || [];
            this.state.addAmenities(loc.tag, loc.amenities);
            $('.type', loc.element).prepend(`<img src='${this.origin}${loc.icon}' alt="marker icon"/>`);
          }
        });
        // Init active filters from URL.
        this.init_active_tags();
        this.init_active_amenities();
      },

      // Initializes the base map.
      init_map: function () {
        this.map = new google.maps.Map(this.map_el[0], {
          scaleControl: true,
          center: this.center,
          zoom: 9,
          scrollwheel: false,
          mapTypeId: google.maps.MapTypeId.ROADMAP
        });

        this.search_center_marker = this.search_center_marker || new google.maps.Marker({
          position: this.center_point,
          animation: google.maps.Animation.DROP
        });

        if (this.search_center_marker) {
          this.search_center_marker.setVisible(false);
          this.search_center_marker.setMap(this.map);
        }
      },

      init_map_locations: function () {
        this.locations.map((loc) => {
          loc.point = new google.maps.LatLng(loc.lat, loc.lng);
          let marker_anchor = new google.maps.MarkerImage(this.marker_image_url) || null;
          marker_anchor = loc.icon ? new google.maps.MarkerImage(loc.icon) : marker_anchor;
          const shadow_anchor = loc.shadow ? new google.maps.MarkerImage(loc.shadow) : null;

          const marker = new google.maps.Marker({
            position: loc.point,
            icon: marker_anchor,
            shadow: shadow_anchor,
            animation: google.maps.Animation.DROP
          });

          loc.infowindow = new google.maps.InfoWindow({
            content: `<div class="marker_tooltip">${loc.markup}</div>`
          });

          google.maps.event.addListener(marker, 'click', (infowindow, marker) => {
            return () => {
              this.locations.map((loc) => {
                loc.infowindow.close();
              })
              infowindow.open(this.map, marker);
            };
          });

          marker.setVisible(false);
          marker.setMap(this.map);
          loc.marker = marker;
        });
      },

      // Populates a state of active tags from an URL parameter "type".
      // Run once on init()
      init_active_tags: function () {
        const active_tags = [];
        // Tags from the URL Params if any.
        const tags = this.get_parameters('type');
        if (tags.length === 0) {
          this.state.setTagsFilter(this.default_tags);
        } else {
          Object.keys(this.state.getTags()).map((tag) => {
            if ($.inArray(this.encode_to_url_format(tag), tags) >= 0) {
              active_tags.push(tag);
            }
          })
          this.state.setTagsFilter(active_tags);
        }
      },

      // Populates a state of active amenities from an URL parameter "amenities".
      // Run once on init()
      init_active_amenities: function () {
        const amenities = this.get_parameters('amenities');
        this.state.setAmenitiesFilter(amenities);
      },
      // Get url params.
      get_parameters: function (param = false) {
        const searchString = decodeURI(window.location.search.substring(1));
        const params = searchString.split("&");
        const hash = {};
        params.map(param => {
          const [key, val] = param.split("=");
          hash[key] = (typeof val === 'string') ? val.includes(',') ? val.split(',') : [val] : [];
        });
        return (param) ? (typeof hash[param] !== 'undefined') ? hash[param] : [] : params;
      },

      // Attaches events to various map controls.
      hookup_map_controls_events: function () {
        this.tag_filters_el.find('input[type=checkbox]').on('change', $.proxy(this.update_tag_filters, this));
        this.search_field_el.on('change', $.proxy(this.apply_search, this));
        this.search_field_el.on("autocompleteselect", $.proxy(this.apply_autocomplete_search, this));
        this.distance_limit_el.on('change', $.proxy(this.apply_distance_limit, this));
        this.amenities_filter_el.find('input[type=checkbox]').on('change', $.proxy(this.update_amenities_filters, this));

        $('.amenities-group', this.amenities_filter_el).each(function (idx, group){
          $('ul', this).on('show.bs.collapse', () => {
            $('header i', this).removeClass('fa-plus').addClass('fa-times');
          });
          $('ul', this).on('hide.bs.collapse', () => {
            $('header i', this).removeClass('fa-times').addClass('fa-plus');
          });
        });
      },

      hookup_state_events: function () {
        this.component_el.on('filterChanged:tags filterChanged:amenities filterChanged:distance', (event, data) => {
          this.apply_filters();
        });
        this.component_el.on('filtersApplied', (e, data) => {
          this.set_url_parameters();
          this.draw_map_locations(data.locations);
        });
        this.component_el.on('filterChanged:tags', (e, data) => {
          this.update_amenities_controls();
        });
        this.component_el.on('filterChanged:amenities', (e, data) => {
          this.draw_selected_amenities();
        })
      },

      // Attempts a map search against Google's
      // GeoCoding API.  If successful, the map
      // is recentered according to the result.
      apply_search: function () {
        var q = this.search_field_el.val();
        if (q === '') {
          this.reset_search_results();
          return;
        }

        this.geocoder().geocode({
          'address': q
        }, (results, status) => {
          if (status === 'OK') {
            this.search_center_point = results[0].geometry.location;

            if (results[0].geometry.bounds) {
              this.map.fitBounds(results[0].geometry.bounds);
            } else {
              var bounds = new google.maps.LatLngBounds();
              bounds.extend(this.search_center_point);
              // Don't zoom in too far on only one marker
              if (bounds.getNorthEast().equals(bounds.getSouthWest())) {
                var extendPoint1 = new google.maps.LatLng(bounds.getNorthEast().lat() + 0.001, bounds.getNorthEast().lng() + 0.001);
                var extendPoint2 = new google.maps.LatLng(bounds.getNorthEast().lat() - 0.001, bounds.getNorthEast().lng() - 0.001);
                bounds.extend(extendPoint1);
                bounds.extend(extendPoint2);
              }
              this.map.fitBounds(bounds);
            }

            this.search_center = this.map.getCenter();
            this.draw_search_center();
            this.apply_distance_limit();
          }
        });
      },

      apply_autocomplete_search: function (event, ui) {
        var locations = this.locations.filter((loc) => loc.name === ui.item.value);
        // Redraw map for selected location.
        if (this.search_center === null) {
          this.search_center = this.map.getCenter();
        }

        this.search_center_marker.setPosition(this.search_center_point);
        this.search_center_marker.setVisible(false);
        var bounds = new google.maps.LatLngBounds();

        locations.map((loc) => {
          bounds.extend(loc.marker.getPosition());
          loc.marker.setVisible(true);
        })

        this.map.fitBounds(bounds);
        this.state.distance = '';
        this.draw_map_locations(locations);
      },

      // Executed every time the viewer sets the distance limit to a new value.
      apply_distance_limit: function () {
        if (this.search_center === null) {
          this.search_center = this.map.getCenter();
        }

        this.draw_search_center();
        this.state.setDistance(this.distance_limit_el.val());
      },

      // Executed if was provided empty ZIP code.
      reset_search_results: function () {
        if (this.search_center === null) {
          this.search_center = this.map.getCenter();
        }

        if (this.search_center_point) {
          this.search_center_marker.setPosition(this.search_center_point);
          this.search_center_marker.setVisible(false);
        }
        this.state.setDistance('');
      },
      update_amenities_controls: function () {
        const amenitiesFilters = this.state.getAmenitiesFilter();
        const availableAmenities = this.state.getAvailableAmenities();

        this.amenities_filter_el.find('input[type=checkbox]').each((idx, el) => {
          const value = +$(el).val();
          if ($.inArray(value, availableAmenities) === -1) {
            $(el).parents('li').attr('checked', false).addClass('hidden');
          }
          else {
            $(el).parents('li').removeClass('hidden');
          }
          if ($.inArray(value, amenitiesFilters) > -1) {
            $(el).attr('checked', true);
          }
        });
        this.amenities_filter_el.find('.amenities-group').each((idx, el) => {
          const totalCount = +$(el).data('total');
          const hiddenCount = +$('ul li.hidden', el).length;
          if (totalCount === hiddenCount) {
            $(el).addClass('hidden');
          }
          else {
            $(el).removeClass('hidden');
          }
        });
      },

      // Applies the current checkbox state of the tag filter controls
      // to the internal filters data structure.
      // Called at init time, and after every checkbox state change.
      update_tag_filters: function () {
        const tag_filters = [];
        this.tag_filters_el.find('input[type=checkbox]:checked').each((idx, el) => {
          tag_filters.push($(el).val());
        });
        this.state.setTagsFilter(tag_filters);
      },

      update_amenities_filters: function () {
        const amenities_filters = [];
        this.amenities_filter_el.find('input[type=checkbox]:checked').each((idx, el) => {
          amenities_filters.push(+$(el).val());
        });
        this.state.setAmenitiesFilter(amenities_filters);
      },

      // Applies tag and distance filters to a list of locations,
      // returns the filtered list.
      apply_filters: function () {
        let locations = this.apply_tag_filters(this.locations);
        locations = this.apply_distance_filters(locations);
        locations = this.apply_amenities_filters(locations);
        this.component_el.trigger('filtersApplied', { locations: locations });
      },

      // Applies tag filters to a list of locations,
      // returns the filtered list.
      apply_tag_filters: function (locations) {
        if (this.state.getTagsFilter().length === 0) {
          return locations;
        }

        return locations.filter((loc) => {
          const intersection = loc.tags.filter(x => this.state.getTagsFilter().includes(x));
          return intersection.length > 0;
        });
      },

      // Applies distance filters to a list of locations,
      // returns the filtered list.
      apply_distance_filters: function (locations) {
        if (!this.search_center) {
          return locations;
        }

        if (this.state.getDistance() === '') {
          return locations;
        }

        const search_center = this.normalize_point(this.search_center);

        var lat1 = parseFloat(search_center.lat);
        var lon1 = parseFloat(search_center.lon);
        var rlat1 = this.toRad(lat1);

        return locations.filter(loc => {
          const R = 3963,
            lat2 = parseFloat(loc.lat),
            lon2 = parseFloat(loc.lng);
          const rlat = this.toRad(lat2 - lat1);
          const rlon = this.toRad(lon2 - lon1);
          const rlat2 = this.toRad(lat2);

          const a = Math.sin(rlat / 2) * Math.sin(rlat / 2) + Math.sin(rlon / 2) * Math.sin(rlon / 2) * Math.cos(rlat1) * Math.cos(rlat2);
          const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
          const d = R * c;

          if (d <= this.state.getDistance()) {
            // Add the distance to the object.
            loc.distance = d;
            return true;
          }
          return false;
        });
      },

      // Applies tag filters to a list of locations,
      // returns the filtered list.
      apply_amenities_filters: function (locations) {
        if (this.state.getAmenitiesFilter().length === 0) {
          return locations;
        }

        return locations.filter((loc) => {
          if (!("amenities" in loc) || loc.amenities.length === 0) {
            return false;
          }
          const intersection = loc.amenities.filter(x => this.state.getAmenitiesFilter().includes(x));
          return intersection.length > 0;
        });
      },

      // Update url params.
      set_url_parameters: function () {
        var url = document.location.pathname,
          params = this.get_parameters(),
          filterTagsRaw = this.tag_filters,
          filteramenitiesRaw = this.amenities_filters,
          filterTags = '',
          filteramenities = '',
          mapLocation = $('.search_field').val() || (params.hasOwnProperty('map_location') && params.map_location) || '';
        if (mapLocation) {
          mapLocation = '?map_location=' + this.encode_to_url_format(mapLocation);
        }
        if (filterTagsRaw) {
          filterTags = !mapLocation ? '?' : '&';
          filterTags += 'type=';
          filterTagsRaw.forEach(tag => {
            filterTags += this.encode_to_url_format(tag) + ',';
          }, this, filterTags);
          filterTags = filterTags.substring(0, filterTags.length - 1);
        }
        if (filteramenitiesRaw) {
          filteramenities = '&amenities=';
          filteramenitiesRaw.forEach(tag => {
            filteramenities += this.encode_to_url_format(tag) + ',';
          }, this, filteramenities);
          filteramenities = filteramenities.substring(0, filteramenities.length - 1);
        }
        window.history.replaceState(null, null, url + mapLocation + filterTags + filteramenities);
      },

      // Renders an extra set of filter boxes below the map.
      draw_map_controls: function () {
        // Show tags filter as default checkboxes.
        const html = Object.entries(this.state.getTags()).reduce((acc, [tag, value]) => {
          const checked = ($.inArray(tag, this.initial_active_tags) >= 0);
          // Show tags filter as default checkboxes.
          let tagHtml = Drupal.theme('openyMapControlCheckbox', checked, tag, '/' + value.marker_icon);
          acc += tagHtml;
          return acc;
        }, '');

        this.tag_filters_el.append(html);
        this.tag_filters_el.find('input[type=checkbox]').on('click', (e) => {
          $(e.target).parent().toggleClass('active');
        });

        // Add locations autocomplete to search field.
        this.search_field_el.autocomplete({
          minLength: 3,
          source: this.locations.map(loc => loc.name)
        });
        this.draw_selected_amenities();
      },

      draw_selected_amenities: function (e) {
        this.selected_amenities_el.empty();

        this.state.getAmenitiesFilter().map((id) => {
          const el = $(`input[value=${id}]`, this.amenities_filter_el).parent();
          this.selected_amenities_el.append(`<label class='btn' id="selected-amenity-${id}" tabindex="0" role="button"><span class="visually-hidden">Remove filter:</span> ${el.html()} <i class="fas fa-times"></i></label>`);
        });

        $('.btn', this.selected_amenities_el).off('click').on('click', (e) => {
          clickSelectedAmenity.call(this, e);
        });

        $('.btn', this.selected_amenities_el).on('keyup', (e) => {
          if (e.code === 'Space' || e.code === 'Enter') {
            clickSelectedAmenity.call(this, e);
          }
        })
      },

      // Update locations on the map by setting their visibility
      // and refit the map bounds to the current set of visible locations.
      draw_map_locations: function (locations) {
        // If the location list is empty, don't adjust the map at all.
        if (locations.length === 0) {
          if (this.search_center_point !== null) {
            this.map.setCenter(this.search_center_point);
          }
          return;
        }

        // Hide all the markers prior to showing only those of interest.
        this.locations.map(loc => loc.marker.setVisible(false));
        var bounds = new google.maps.LatLngBounds();

        locations.map((loc) => {
          bounds.extend(loc.marker.getPosition());
          loc.marker.setVisible(true);
        });

        // Don't zoom in too far on only one marker.
        if (bounds.getNorthEast().equals(bounds.getSouthWest())) {
          var extendPoint1 = new google.maps.LatLng(bounds.getNorthEast().lat() + 0.001, bounds.getNorthEast().lng() + 0.001);
          var extendPoint2 = new google.maps.LatLng(bounds.getNorthEast().lat() - 0.001, bounds.getNorthEast().lng() - 0.001);
          bounds.extend(extendPoint1);
          bounds.extend(extendPoint2);
        }
        this.map.fitBounds(bounds);
        this.draw_list_locations(locations);

      },

      // Render the list of locations.
      draw_list_locations: function (locations) {
        // Hide all heading locations.
        this.locations.map((loc) => {
          if (typeof loc.element !== 'undefined') {
            loc.element.parent().hide();
            loc.element.parents('.locations-list-lb').find('.location-title').hide();
          }
        });

        if (locations.length === 0) {
          const message_html = `<div class="col-xs-12 text-center"><p>${Drupal.t('No locations were found in this area. Please try a different area or increase your search distance.')}</p></div>`;
          this.messages_el.hide().html(message_html).fadeIn();
          return;
        } else {
          this.messages_el.hide();
        }

        // Show filtered locations.
        locations.map((loc) => {
          if (typeof loc.element !== 'undefined') {
            loc.element.parent().show();
            loc.element.parents('.locations-list-lb').find('.location-title').show();
          }
        });
      },

      draw_search_center: function () {
        if (this.search_center_point) {
          this.search_center_marker.setPosition(this.search_center_point);
          this.search_center_marker.setVisible(true);
        }
      }
    }
  };

  Drupal.openyMapLeaflet = function () {
    return {
      state: state,
      origin: `${window.location.origin}${drupalSettings.path.baseUrl}`,
      baseLayer: Drupal.baseLayerWikimedia,
      // Array of location data.
      locations: null,
      // The Map object.
      map: null,
      // The center point of a search location or distance limit.
      search_center_point: null,
      // Marker designating the center point.
      search_center_marker: null,
      // The paddings for fitBounds method, depends on marker dimensions.
      fitBoundsOptions: null,
      // Suffix for nominatim geocoder
      default_search_location: null,

      /**
       * Utility functions.
       */
      // Checks if the provider library object has loaded
      libraryIsLoaded: function () {
        return typeof window.L !== 'undefined';
      },
      // Normalizes a map-vendor specific representation of
      // a coordinate point to a {lat:x, lon:y} object.
      normalize_point: function (point) {
        return {
          'lat': point.lat(),
          'lon': point.lng()
        };
      },
      // Convert a number from degrees to radians.
      toRad: function (n) {
        return n * Math.PI / 180;
      },
      // Convert string to url format:
      // remove all non-alphanumeric characters, convert to lowercase,
      // replace spaces with dashes.
      encode_to_url_format: function (txt) {
        return txt
          .toString()
          .toLowerCase()
          .replace(/[^\w ]+/g, '')
          .replace(/ +/g, '-');
      },

      /**
       * Main functionality.
       */
      init: function (args) {
        this.component_el = args.component_el;
        this.locations = args.map_data;
        this.default_tags = drupalSettings.openyMapSettings.default_tags;
        this.leaflet_clustering = drupalSettings.openyMapSettings.leaflet_clustering;

        this.init_state();
        // Depends on markers' dimensions.
        this.fitBoundsOptions = {
          paddingTopLeft: L.point(0, 40),
          paddingBottomRight: L.point(0, 10)
        };

        this.search_center_marker = args.search_center_marker || null;

        this.map_el = this.component_el.find('.openy-map');
        this.messages_el = this.component_el.find('.messages');
        this.selected_amenities_el = this.component_el.find('.selected-amenities');

        this.map_controls_el = this.component_el.find('.map_controls');
        this.search_field_el = this.map_controls_el.find('input#search_field');
        this.distance_limit_el = this.map_controls_el.find('select#distance_limit');
        this.tag_filters_el = this.map_controls_el.find('.tag_filters');
        this.amenities_filter_el = this.map_controls_el.find('#amenities-filter');

        this.init_map();
        this.init_map_locations();
        if (this.leaflet_clustering.enable) {
          this.init_clustering();
        }
        this.draw_map_controls();
        this.hookup_map_controls_events();
        this.hookup_state_events();
        this.update_tag_filters();

        var mapLocation = document.location.href.match(/&?[amp;]?map_location=([\w|\+]*)&?[amp;]?/);

        this.component_el.find('.zip-code button.btn')
          .on('click', $.proxy(this.apply_search, this));

        this.search_field_el.on('keypress', (e)=> {
          if (e.keyCode === 13) this.apply_search();
        });
        if (mapLocation) {
          this.search_field_el.val(mapLocation[1].replace(/\+/g, ' '));
          $('.distance_limit option').eq(2).attr('selected', true);
          $('.zip-code button.btn').click();
        }
      },

      init_state: function () {
        this.state.element = this.component_el;
        // Extract tags.
        this.locations.map((loc) => {
          if (!loc.tags) {
            return;
          }
          const tag = loc.tags[0];
          loc.tag = tag;
          this.state.addTag(tag, { 'marker_icon': loc.icon });
        });
        // Collect amenities
        this.locations.map((loc) => {
          const element = $(`article[data-openy-map-location-id=${loc.location_id}]`);
          if (element.length > 0) {
            loc.element = element;
            loc.amenities = element.data('amenities').map(el => +el) || [];
            this.state.addAmenities(loc.tag, loc.amenities);
            $('.type', loc.element).prepend(`<img src='${this.origin}${loc.icon}' alt="marker icon"/>`);
          }
        });
        // Init active filters from URL.
        this.init_active_tags();
        this.init_active_amenities();
      },

      // Initializes the base map.
      init_map: function () {
        this.map = L.map(this.map_el[0]).setView([51.505, -0.09], 13);
        L.tileLayer(this.baseLayer.tilePattern, this.baseLayer.options).addTo(this.map);
        this.map.scrollWheelZoom.disable();
        if (L.Browser.mobile) {
          this.map.dragging.disable();
        }
        var icon = L.icon({
          iconUrl: `${this.origin}${this.search_icon}`,
          iconRetinaUrl: `${this.origin}${this.search_icon_retina}`,
          shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
          iconSize: [25, 41],
          iconAnchor: [12, 41],
          popupAnchor: [1, -34],
          shadowSize: [41, 41]
        });
        this.search_center_marker = this.search_center_marker || L.marker(this.map.getCenter(), { icon: icon });

        if (this.search_center_marker) {
          this.search_center_marker.removeFrom(this.map);
        }
      },
      init_map_locations: function () {
        const iconOptionsKeys = ['iconSize', 'shadowSize', 'iconAnchor', 'shadowAnchor', 'popupAnchor'];

        this.locations.forEach((loc) => {
          loc.point = L.latLng(loc.lat, loc.lng);
          const html = `<div class="marker_tooltip">${loc.markup}</div>`;

          // Start with defaults
          const icon_options = {
            iconUrl: window.location.origin + '/' + loc.icon,
            iconSize: [32, 42],
            iconAnchor: [16, 38],
            popupAnchor: [0, -36]
          };

          // Merge in overrides if the location has them
          iconOptionsKeys.forEach((k) => {
            if (typeof loc[k] !== 'undefined') {
              icon_options[k] = loc[k];
            }
          });

          const icon = loc.icon ? L.icon(icon_options) : new L.Icon.Default();

          const marker = L.marker(loc.point, { icon });
          marker.bindPopup(html, { maxWidth: 180 });
          loc.marker = marker;
        });
      },
      init_clustering: function () {
        const options = {
          showCoverageOnHover: false,
          zoomToBoundsOnClick: false
        };

        if (this.leaflet_clustering.cluster_settings.zoom_to_bounds_on_click) {
          options.zoomToBoundsOnClick = true;
        }
        if (this.leaflet_clustering.cluster_settings.show_coverage_on_hover) {
          options.showCoverageOnHover = true;
        }
        if (this.leaflet_clustering.disable_clustering_at_zoom > 0) {
          options.disableClusteringAtZoom = this.leaflet_clustering.disable_clustering_at_zoom;
        }

        this.cluster = L.markerClusterGroup(options);

        this.locations.map((loc) => {
          loc.marker.removeFrom(this.map);
          this.cluster.addLayer(loc.marker);
        })
        this.map.addLayer(this.cluster);
      },

      draw_selected_amenities: function (e) {
        this.selected_amenities_el.empty();

        this.state.getAmenitiesFilter().map((id) => {
          const el = $(`input[value=${id}]`, this.amenities_filter_el).parent();
          this.selected_amenities_el.append(`<label class='btn' id="selected-amenity-${id}" tabindex="0" role="button"><span class="visually-hidden">Remove filter:</span> ${el.html()} <i class="fas fa-times"></i></label>`);
        });

        $('.btn', this.selected_amenities_el).off('click').on('click', (e) => {
          clickSelectedAmenity.call(this, e);
        });

        $('.btn', this.selected_amenities_el).on('keyup', (e) => {
          if (e.code === 'Space' || e.code === 'Enter') {
            clickSelectedAmenity.call(this, e);
          }
        })
      },

      hookup_state_events: function () {
        this.component_el.on('filterChanged:tags filterChanged:amenities filterChanged:distance', (event, data) => {
          this.apply_filters();
        });
        this.component_el.on('filtersApplied', (e, data) => {
          this.set_url_parameters();
          this.draw_map_locations(data.locations);
        });
        this.component_el.on('filterChanged:tags', (e, data) => {
          this.update_amenities_controls();
        });
        this.component_el.on('filterChanged:amenities', (e, data) => {
          this.draw_selected_amenities();
        })
      },
      // Attaches events to various map controls.
      hookup_map_controls_events: function () {
        this.tag_filters_el.find('input[type=checkbox]').on('change', $.proxy(this.update_tag_filters, this));
        this.search_field_el.on('change', $.proxy(this.apply_search, this));
        this.search_field_el.on("autocompleteselect", $.proxy(this.apply_autocomplete_search, this));
        this.distance_limit_el.on('change', $.proxy(this.apply_distance_limit, this));
        this.amenities_filter_el.find('input[type=checkbox]').on('change', $.proxy(this.update_amenities_filters, this));

        $('.amenities-group', this.amenities_filter_el).each(function (idx, group){
          $('ul', this).on('show.bs.collapse', () => {
            $('header i', this).removeClass('fa-plus').addClass('fa-times');
          });
          $('ul', this).on('hide.bs.collapse', () => {
            $('header i', this).removeClass('fa-times').addClass('fa-plus');
          });
        });
      },

      // Attempts a map search against OSM Nominatim API. If successful, the map
      // is recentered according to the result.
      apply_search: function () {
        var q = this.search_field_el.val();
        if (q === '') {
          this.reset_search_results();
          return;
        }

        this.geocode(q, (data, status) => {
          if (status === 'success' && data.length > 0) {
            this.search_center_point = L.latLng(data[0].lat, data[0].lon);

            if (data[0].boundingbox) {
              var bounds = L.latLngBounds();
              bounds.extend(L.latLng(data[0].boundingbox[0], data[0].boundingbox[2]));
              bounds.extend(L.latLng(data[0].boundingbox[1], data[0].boundingbox[3]));
              this.map.fitBounds(bounds, this.fitBoundsOptions);
            }
            else {
              // If no bounding box, just zoom around the point
              this.map.setView(this.search_center_point, 13);
            }

            this.search_center = this.search_center_point;
            this.draw_search_center();
            this.apply_distance_limit();
          }
        });
      },

      geocode: function (query, callback) {
        var base = 'https://nominatim.openstreetmap.org/search?format=json&limit=5&q=';
        var suffix = this.default_search_location ? '+' + this.default_search_location : '';
        $.getJSON(base + query + suffix, callback);
      },

      apply_autocomplete_search: function (event, ui) {
        var locations = this.locations.filter((loc) => loc.name === ui.item.value);
        // Redraw map for selected location.
        if (this.search_center === null) {
          this.search_center = this.map.getCenter();
        }

        this.search_center_marker.removeFrom(this.map);
        var bounds = L.latLngBounds();
        locations.map((loc) => {
          bounds.extend(loc.point);
          loc.marker.addTo(this.map);
        })
        this.map.fitBounds(bounds, this.fitBoundsOptions);
        this.state.distance = '';
        this.draw_map_locations(locations);
      },

      // Executed every time the viewer sets the distance limit to a new value.
      apply_distance_limit: function () {
        if (this.search_center === null) {
          this.search_center = this.map.getCenter();
        }

        this.draw_search_center();
        // Coerce to number; if not a number, clear the distance filter.
        const raw = this.distance_limit_el.val();
        const miles = parseFloat(raw);
        this.state.setDistance(Number.isFinite(miles) ? miles : '');
      },

      // Executed if was provided empty ZIP code.
      reset_search_results: function () {
        if (this.search_center === null) {
          this.search_center = this.map.getCenter();
        }

        if (this.search_center_point) {
          this.search_center_marker.setLatLng(this.search_center_point);
          this.search_center_marker.addTo(this.map);
        }
        this.state.setDistance('');
      },
      update_amenities_controls: function () {
        const amenitiesFilters = this.state.getAmenitiesFilter();
        const availableAmenities = this.state.getAvailableAmenities();

        this.amenities_filter_el.find('input[type=checkbox]').each((idx, el) => {
          const value = +$(el).val();
          if ($.inArray(value, availableAmenities) === -1) {
            $(el).parents('li').attr('checked', false).addClass('hidden');
          }
          else {
            $(el).parents('li').removeClass('hidden');
          }
          if ($.inArray(value, amenitiesFilters) > -1) {
            $(el).attr('checked', true);
          }
        });
        this.amenities_filter_el.find('.amenities-group').each((idx, el) => {
          const totalCount = +$(el).data('total');
          const hiddenCount = +$('ul li.hidden', el).length;
          if (totalCount === hiddenCount) {
            $(el).addClass('hidden');
          }
          else {
            $(el).removeClass('hidden');
          }
        });
      },

      // Applies the current checkbox state of the tag filter controls
      // to the internal filters data structure.
      // Called at init time, and after every checkbox state change.
      update_tag_filters: function () {
        const tag_filters = [];
        this.tag_filters_el.find('input[type=checkbox]:checked').each((idx, el) => {
          tag_filters.push($(el).val());
        });
        this.state.setTagsFilter(tag_filters);
      },

      update_amenities_filters: function () {
        const amenities_filters = [];
        this.amenities_filter_el.find('input[type=checkbox]:checked').each((idx, el) => {
          amenities_filters.push(+$(el).val());
        });
        this.state.setAmenitiesFilter(amenities_filters);
      },

      // Applies tag and distance filters to a list of locations,
      // returns the filtered list.
      apply_filters: function () {
        let locations = this.apply_tag_filters(this.locations);
        locations = this.apply_distance_filters(locations);
        locations = this.apply_amenities_filters(locations);
        this.component_el.trigger('filtersApplied', {locations: locations});
      },

      // Applies tag filters to a list of locations,
      // returns the filtered list.
      apply_tag_filters: function (locations) {
        if (this.state.getTagsFilter().length === 0) {
          return locations;
        }

        return locations.filter((loc) => {
          const intersection = loc.tags.filter(x => this.state.getTagsFilter().includes(x));
          return intersection.length > 0;
        });
      },

      // Applies distance filters to a list of locations,
      // returns the filtered list.
      apply_distance_filters: function (locations) {
        if (!this.search_center) {
          return locations;
        }

        const distance = parseFloat(this.state.getDistance());
        if (!Number.isFinite(distance)) {
          // No valid distance selected → don’t filter by distance
          return locations;
        }

        const lat1 = parseFloat(this.search_center.lat);
        const lon1 = parseFloat(this.search_center.lng);
        const rlat1 = this.toRad(lat1);

        return locations.filter(loc => {
          const R = 3963; // miles
          const lat2 = parseFloat(loc.point.lat);
          const lon2 = parseFloat(loc.point.lng);
          const rlat = this.toRad(lat2 - lat1);
          const rlon = this.toRad(lon2 - lon1);
          const rlat2 = this.toRad(lat2);

          const a = Math.sin(rlat / 2) * Math.sin(rlat / 2)
                  + Math.sin(rlon / 2) * Math.sin(rlon / 2) * Math.cos(rlat1) * Math.cos(rlat2);
          const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
          const d = R * c;

          if (d <= distance) {
            loc.distance = d;
            return true;
          }
          return false;
        });
      },
      // Applies amenities filters to a list of locations,
      // returns the filtered list.
      apply_amenities_filters: function (locations) {
        if (this.state.getAmenitiesFilter().length === 0) {
          return locations;
        }

        return locations.filter((loc) => {
          if (!("amenities" in loc) || loc.amenities.length === 0) {
            return false;
          }
          const intersection = loc.amenities.filter(x => this.state.getAmenitiesFilter().includes(x));
          return intersection.length > 0;
        });
      },

      // Populates a state of active tags from an URL parameter "type".
      // Run once on init()
      init_active_tags: function () {
        const active_tags = [];
        // Tags from the URL Params if any.
        const tags = this.get_parameters('type');
        if (tags.length === 0) {
          this.state.setTagsFilter(this.default_tags);
        }
        else {
          Object.keys(this.state.getTags()).map((tag) => {
            if ($.inArray(this.encode_to_url_format(tag), tags) >= 0) {
              active_tags.push(tag);
            }
          })
          this.state.setTagsFilter(active_tags);
        }
      },
      // Populates a state of active amenities from an URL parameter "amenities".
      // Run once on init()
      init_active_amenities: function () {
        const amenities = this.get_parameters('amenities');
        this.state.setAmenitiesFilter(amenities);
      },
      // Get url params.
      get_parameters: function (param = false) {
        const searchString = decodeURI(window.location.search.substring(1));
        const params = searchString.split("&");
        const hash = {};
        params.map(param => {
          const [key, val] = param.split("=");
          hash[key] = (typeof val === 'string') ? val.includes(',') ? val.split(',') : [val] : [];
        });
        return (param) ? (typeof hash[param] !== 'undefined') ? hash[param] : [] : params;
      },
      // Update url params.
      set_url_parameters: function () {
        var url = document.location.pathname,
          params = this.get_parameters(),
          filterTagsRaw = this.state.getTagsFilter(),
          filteramenitiesRaw = this.state.getAmenitiesFilter() || [],
          filterTags = '',
          filteramenities = '',
          utmListRaw = {},
          utms = '',
          mapLocation = this.search_field_el.val() || (params.hasOwnProperty('map_location') && params.map_location) || '';
        for (let [key, value] of Object.entries(params)) {
          var prmsKey = key.split("_");
          if (prmsKey[0] === 'utm') {
            utmListRaw[key] = value;
          }
        }

        if (Object.keys(utmListRaw).length) {
          utms = '&';
          utms += jQuery.param(utmListRaw);
        }

        if (mapLocation) {
          mapLocation = '?map_location=' + this.encode_to_url_format(mapLocation);
        }
        if (filterTagsRaw) {
          filterTags = !mapLocation ? '?' : '&';
          filterTags += 'type=';
          filterTagsRaw.forEach(function (tag) {
            filterTags += this.encode_to_url_format(tag) + ',';
          }, this, filterTags);
          filterTags = filterTags.substring(0, filterTags.length - 1);
        }
        if (filteramenitiesRaw) {
          filteramenities = '&amenities=';
          filteramenitiesRaw.forEach(function (tag) {
            filteramenities += this.encode_to_url_format(tag) + ',';
          }, this, filteramenities);
          filteramenities = filteramenities.substring(0, filteramenities.length - 1);
        }
        window.history.replaceState(null, null, url + mapLocation + filterTags + filteramenities + utms);
      },
      // Renders an extra set of filter boxes below the map.
      draw_map_controls: function () {
        // Show tags filter as default checkboxes.
        const html = Object.entries(this.state.getTags()).reduce((acc, [tag, value]) => {
          const checked = ($.inArray(tag, this.state.getTagsFilter()) >= 0);
          let tagHtml = Drupal.theme('openyMapControlCheckbox', checked, tag,`${window.location.origin}/${value.marker_icon}`);
          acc += tagHtml;
          return acc;
        }, '');

        this.tag_filters_el.append(html);
        // Bind Tag click event to toggle active class.
        this.tag_filters_el.find('input[type=checkbox]').on('click', (e) => {
          $(e.target).parent().toggleClass('active');
        });
        // Add locations autocomplete to search field.
        this.search_field_el.autocomplete({
          minLength: 3,
          source: this.locations.map(loc => loc.name)
        });
        this.draw_selected_amenities();
      },
      // Update locations on the map by setting their visibility
      // and refit the map bounds to the current set of visible locations.
      draw_map_locations: function (locations) {
        this.locations.map((loc) => {
          loc.marker.removeFrom(this.map);
        });
        // If the location list is empty, don't adjust the map at all.
        if (locations.length === 0) {
          if (this.search_center_point !== null) {
            this.map.setView(this.search_center_point);
          }
          return;
        }

        var bounds = L.latLngBounds([]);
        if (this.leaflet_clustering.enable) {
          this.cluster.clearLayers();
        }

        locations.map((loc) => {
          bounds.extend(loc.point);
          if (this.leaflet_clustering.enable) {
            this.cluster.addLayer(loc.marker);
          }
          else {
            loc.marker.addTo(this.map);
          }
        });
        // Don't zoom in too far on only one marker.
        if (bounds.getNorthEast().equals(bounds.getSouthWest())) {
          var extendPoint1 = L.latLng(bounds.getNorthEast().lat + 0.001, bounds.getNorthEast().lng + 0.001);
          var extendPoint2 = L.latLng(bounds.getNorthEast().lat - 0.001, bounds.getNorthEast().lng - 0.001);
          bounds.extend(extendPoint1);
          bounds.extend(extendPoint2);
        }
        this.map.fitBounds(bounds, this.fitBoundsOptions);
        this.draw_list_locations(locations);
      },
      // Render the list of locations.
      draw_list_locations: function (locations) {
        // Hide all heading locations.
        this.locations.map((loc) => {
          if (typeof loc.element !== 'undefined') {
            loc.element.parent().hide();
            loc.element.parents('.locations-list-lb').find('.location-title').hide();
          }
        })

        if (locations.length === 0) {
          const message_html = `<div class="col-xs-12 text-center"><p>${Drupal.t('No locations were found in this area. Please try a different area or increase your search distance.')}</p></div>`;
          this.messages_el.hide().html(message_html).fadeIn();
          return;
        }
        else {
          this.messages_el.hide();
        }

        // Show filtered locations.
        locations.map((loc) => {
          if (typeof loc.element !== 'undefined') {
            loc.element.parent().show();
            loc.element.parents('.locations-list-lb').find('.location-title').show();
          }
        });
      },
      draw_search_center: function () {
        if (this.search_center_point) {
          this.search_center_marker.setLatLng(this.search_center_point);
          this.search_center_marker.addTo(this.map);
        }
      },
    };
  };

  Drupal.behaviors.openyMap = {
    attach: function (context, settings) {
      if (typeof settings.openyMap === 'undefined' || typeof settings.openyMapSettings === 'undefined') {
        return;
      }

      let map;

      switch (settings.openyMapSettings.engine) {
        case 'gmaps':
          map = new Drupal.openyMap();
          map.search_icon = settings.openyMapSettings.search_icon;
          break;

        case 'leaflet':
        default:
          map = new Drupal.openyMapLeaflet();
          map.default_search_location = settings.openyMapSettings.default_location;
          map.search_icon = settings.openyMapSettings.search_icon;
          map.search_icon_retina = settings.openyMapSettings.search_icon_retina;
          switch (settings.openyMapSettings.base_layer) {
            case 'Esri.WorldStreetMap':
              map.baseLayer = Drupal.baseLayerEsriWorldStreetMap;
              break;

            case 'Esri.NatGeoWorldMap':
              map.baseLayer = Drupal.baseLayerEsriNatGeoWorldMap;
              break;

            case 'OpenStreetMap.Mapnik':
              map.baseLayer = Drupal.baseLayerOpenStreetMapMapnik;
              break;

            case 'Wikimedia':
              map.baseLayer = Drupal.baseLayerWikimedia;
              break;
          }
          let override = settings.openyMapSettings.base_layer_override;
          if (override.enable && override.pattern) {
            map.baseLayer.tilePattern = override.pattern;
          }
          break;
      }

      once('amenities-filter-control', '.amenities-filter-control', context)
        .forEach((control) => {
          const $control = $(control);
          $control.click(function(){
            if ($(this).hasClass('collapsed')) {
              $('i.fas', this).removeClass('fa-plus').addClass('fa-times');
            }
            else {
              $('i.fas', this).removeClass('fa-times').addClass('fa-plus');
            }
          })
        });

      once('openy-map-canvas', '.openy-map-canvas', context)
        .forEach((canvas) => {
          const $canvas = $(canvas);
          var timer = setInterval(function () {
            if (!map.libraryIsLoaded()) {
              return;
            }

          map.init({
            component_el: $canvas.closest('.block-openy-map'),
            map_data: settings.openyMap
          });

          // Reset openyMap data (fix for old pins on new map after ajax call).
          settings.openyMap = [];
          clearInterval(timer);
        }, 100);
      });
    }
  };

  /**
   * Theme function for the map control filter checkbox. To override this, see:
   * https://www.drupal.org/node/3374085
   *
   * @param {bool} checked
   *   Whether the checkbox is checked.
   * @param {string} tag
   *   The tag name.
   * @param {string} imageSource
   *   The source for the checkbox image.
   *
   * @return {string}
   *   The control markup.
   */
  Drupal.theme.openyMapControlCheckbox = (checked, tag, imageSource) =>
    `<label class="btn btn-default ${checked ? 'active' : ''}" for="tag_${tag}">
      <img class="tag_icon inline-hidden-sm" src="${imageSource}" aria-hidden="true" alt="" />
      <input autocomplete="off" id="tag_${tag}" class="tag_${tag}" type="checkbox" value="${tag}" ${checked ? 'checked="checked"' : ''}/>${tag}
    </label>`;

})(jQuery, window, Drupal, drupalSettings, once);
