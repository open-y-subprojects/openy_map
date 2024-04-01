/**
 * Behaviors for the 'Today's hours' functionality.
 */
(function ($, Drupal) {
  Drupal.behaviors.today_hours = {
    /**
     * Used to track the setInveral.
     */
    refreshTimer: false,

    /**
     * @returns {string}
     */
    getDayOfWeek: function (tz) {
      // ISO day of week. returns a string of day of week, e.g. Mon, Tue, etc.
      return moment().tz(tz).format('ddd');
    },

    /**
     * @returns {string}
     */
    getDate: function (tz) {
      return moment().tz(tz).format('YYYY-MM-DD');
    },

    /**
     * Primary method for updating the today hours.
     */
    updateTodayHours: function (todayHours) {
      var nid = todayHours.parents('article.node').attr('data-openy-map-location-id');
      if (typeof drupalSettings.lb_branch_hours_blocks === 'undefined') {
        drupalSettings.lb_branch_hours_blocks = {};
      }

      var hoursData = drupalSettings.lb_branch_hours_blocks.branch_hours[nid] || {};
      var tz = drupalSettings.lb_branch_hours_blocks.tz || 'America/New York';
      tz = tz.replace(/ /g, "_");

      if (Object.keys(hoursData).length) {
        var todayString = Drupal.behaviors.today_hours.getDate(tz);
        var dayOfWeek = Drupal.behaviors.today_hours.getDayOfWeek(tz);
        var exceptions = drupalSettings.lb_branch_hours_blocks.exceptions; // Holidays and other day exceptions will come later.

        if (typeof exceptions[todayString] != 'undefined') {
          todayHours.html(exceptions[todayString]);
        }
        else {
          todayHours.html(hoursData[dayOfWeek]);
        }
      }
    },

    /**
     * Drupal behavior attach.
     *
     * @param context
     * @param settings
     */
    attach: function (context, settings) {
      var $todayHours = $('.hours .field-branch-hours');
      var onceClass = 'refresh-interval-set';

      $todayHours.each((i, element) => {
        // Bail out if there's already refresh action set.
        if (!$(element).hasClass(onceClass)) {

          // This will ensure that if people leave the tab open or the page comes back
          // into memory on a phone the hour will always be correct.
          this.refreshTimer = setInterval(this.updateTodayHours($(element)), 60 * 1000);

          // Run for the first time.
          this.updateTodayHours($(element));
          $(element).addClass(onceClass);
        }
      });
    }

  };
})(jQuery, Drupal);
